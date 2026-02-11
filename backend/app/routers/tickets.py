from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, cast, String

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_role
from ..email_service import email_service

router = APIRouter()


def _get_priority_id_from_enum(db: Session, priority_value) -> Optional[int]:
    """Retourne l'id de la table priorities correspondant au code de l'enum (ex: TicketPriority.CRITIQUE → id de 'critique')."""
    if priority_value is None:
        return None
    code = getattr(priority_value, "value", str(priority_value))
    p = db.query(models.Priority).filter(models.Priority.code == code).first()
    return p.id if p else None


@router.post("/", response_model=schemas.TicketRead)
def create_ticket(
    ticket_in: schemas.TicketCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("Utilisateur")),
):
    """Créer un nouveau ticket"""
    # Générer le numéro de ticket automatiquement
    # Récupérer le dernier numéro de ticket
    last_ticket = db.query(models.Ticket).order_by(models.Ticket.number.desc()).first()
    next_number = 1
    if last_ticket and last_ticket.number:
        next_number = last_ticket.number + 1
    
    # Priorité non définie à la création par l'utilisateur ; DSI/Adjoint DSI la définit à l'assignation
    priority = getattr(ticket_in, "priority", None)
    priority_id = _get_priority_id_from_enum(db, priority) if priority else None
    ticket = models.Ticket(
        number=next_number,  # Assigner le numéro généré
        title=ticket_in.title,
        description=ticket_in.description,
        type=ticket_in.type,
        priority=priority,
        priority_id=priority_id,
        category=ticket_in.category,  # Catégorie du ticket
        creator_id=current_user.id,
        user_agency=current_user.agency,  # Enregistrer l'agence de l'utilisateur créateur
        status=models.TicketStatus.EN_ATTENTE_ANALYSE,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    
    # Créer une notification pour les Secrétaires/Adjoints DSI, DSI et Admin
    # Récupérer tous les utilisateurs concernés (Secrétaire DSI, Adjoint DSI, DSI, Admin)
    # Ces rôles sont ceux qui peuvent assigner des tickets à des techniciens
    target_roles = db.query(models.Role).filter(
        models.Role.name.in_(["Secrétaire DSI", "Adjoint DSI", "DSI", "Admin"])
    ).all()
    
    # Préparer l'envoi d'emails en arrière-plan (asynchrone)
    notified_users = []
    if target_roles:
        for role in target_roles:
            users = (
                db.query(models.User)
                .options(joinedload(models.User.role))
                .filter(
                    models.User.role_id == role.id,
                    models.User.actif == True
                )
                .all()
            )
            for user in users:
                # Créer une notification dans la base de données
                notification = models.Notification(
                    user_id=user.id,
                    type=models.NotificationType.NOUVEAU_TICKET,
                    ticket_id=ticket.id,
                    message=f"Nouveau ticket #{ticket.number} créé: {ticket.title}",
                    read=False
                )
                db.add(notification)
                
                # Ajouter l'utilisateur à la liste pour l'envoi d'emails (éviter doublons par email)
                if user.email and user.email.strip() and user.email not in [u.email for u in notified_users if u.email]:
                    notified_users.append(user)
        
        db.commit()
        
        # Ajouter les tâches d'envoi d'emails en arrière-plan
        for user in notified_users:
            background_tasks.add_task(
                email_service.send_ticket_created_notification_with_actions,
                ticket_id=str(ticket.id),
                ticket_number=ticket.number,
                ticket_title=ticket.title,
                creator_name=current_user.full_name,
                recipient_email=user.email,
                recipient_role=user.role.name if user.role else "",
                recipient_name=user.full_name
            )
    
    # Créer une notification pour le créateur du ticket
    creator_notification = models.Notification(
        user_id=current_user.id,
        type=models.NotificationType.TICKET_CREE,
        ticket_id=ticket.id,
        message=f"Votre ticket #{ticket.number} a été créé avec succès: {ticket.title}",
        read=False
    )
    db.add(creator_notification)
    db.commit()
    
    # Envoyer un email de confirmation au créateur en arrière-plan (asynchrone)
    if current_user.email and current_user.email.strip():
        background_tasks.add_task(
            email_service.send_ticket_created_to_creator_notification,
            ticket_id=str(ticket.id),
            ticket_number=ticket.number,
            ticket_title=ticket.title,
            creator_email=current_user.email,
            creator_name=current_user.full_name
        )
    
    # Charger les relations pour la réponse
    ticket = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
        .filter(models.Ticket.id == ticket.id)
        .first()
    )
    
    return ticket


@router.get("/me", response_model=List[schemas.TicketRead])
def list_my_tickets(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Liste des tickets créés par l'utilisateur connecté"""
    tickets = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
        .filter(models.Ticket.creator_id == current_user.id)
        .order_by(models.Ticket.created_at.desc())
        .all()
    )
    return tickets


@router.get("/", response_model=List[schemas.TicketRead])
def list_all_tickets(
    search: Optional[str] = Query(None, description="Rechercher par ID, Numéro, Titre ou Description"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_role("Secrétaire DSI", "Adjoint DSI", "DSI", "Admin")
    ),
):
    """Liste de tous les tickets (pour secrétaire/adjoint/DSI/admin)"""
    query = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
    )
    
    # Ajouter le filtre de recherche si fourni
    if search:
        # Essayer de convertir la recherche en nombre pour une recherche exacte
        search_number = None
        try:
            search_number = int(search.strip())
        except (ValueError, AttributeError):
            pass
        
        # Construire le filtre de recherche
        if search_number is not None:
            # Si la recherche est un nombre pur, faire UNIQUEMENT une recherche exacte par numéro de ticket
            # (le numéro visible par l'utilisateur, pas l'ID interne)
            # Cela évite les faux positifs si l'ID diffère du numéro
            search_conditions = [
                models.Ticket.number == search_number  # Recherche exacte par numéro uniquement
            ]
        else:
            # Si ce n'est pas un nombre, faire une recherche partielle sur tous les champs
            search_conditions = [
                cast(models.Ticket.id, String).ilike(f"%{search}%"),
                models.Ticket.title.ilike(f"%{search}%"),
                models.Ticket.description.ilike(f"%{search}%"),
                cast(models.Ticket.number, String).ilike(f"%{search}%")
            ]
        
        search_filter = or_(*search_conditions)
        query = query.filter(search_filter)
    
    tickets = query.order_by(models.Ticket.created_at.desc()).all()
    return tickets


@router.get("/assigned", response_model=List[schemas.TicketRead])
def list_assigned_tickets(
    search: Optional[str] = Query(None, description="Rechercher par ID, Numéro, Titre ou Description"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Liste des tickets assignés au technicien connecté"""
    query = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
        .filter(models.Ticket.technician_id == current_user.id)
    )
    
    # Ajouter le filtre de recherche si fourni
    if search:
        # Essayer de convertir la recherche en nombre pour une recherche exacte
        search_number = None
        try:
            search_number = int(search.strip())
        except (ValueError, AttributeError):
            pass
        
        # Construire le filtre de recherche
        if search_number is not None:
            # Si la recherche est un nombre pur, faire UNIQUEMENT une recherche exacte par numéro de ticket
            # (le numéro visible par l'utilisateur, pas l'ID interne)
            # Cela évite les faux positifs si l'ID diffère du numéro
            search_conditions = [
                models.Ticket.number == search_number  # Recherche exacte par numéro uniquement
            ]
        else:
            # Si ce n'est pas un nombre, faire une recherche partielle sur tous les champs
            search_conditions = [
                cast(models.Ticket.id, String).ilike(f"%{search}%"),
                models.Ticket.title.ilike(f"%{search}%"),
                models.Ticket.description.ilike(f"%{search}%"),
                cast(models.Ticket.number, String).ilike(f"%{search}%")
            ]
        
        search_filter = or_(*search_conditions)
        query = query.filter(search_filter)

    tickets = query.order_by(models.Ticket.created_at.desc()).all()
    return tickets


@router.get("/{ticket_id}", response_model=schemas.TicketRead)
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Récupérer un ticket par son ID"""
    ticket = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
        .filter(models.Ticket.id == ticket_id)
        .first()
    )
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )
    
    # Vérifier les permissions : créateur, technicien assigné, ou agent/DSI
    is_creator = ticket.creator_id == current_user.id
    is_assigned_tech = ticket.technician_id == current_user.id
    is_agent = current_user.role and current_user.role.name in ["Secrétaire DSI", "Adjoint DSI", "DSI", "Admin"]
    
    if not (is_creator or is_assigned_tech or is_agent):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
        )
    
    return ticket


@router.put("/{ticket_id}", response_model=schemas.TicketRead)
def edit_ticket(
    ticket_id: int,
    ticket_in: schemas.TicketEdit,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    if ticket.creator_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Bloquer la modification si le ticket est assigné ou dans un statut bloqué
    blocked_statuses = [
        models.TicketStatus.ASSIGNE_TECHNICIEN,
        models.TicketStatus.EN_COURS,
        models.TicketStatus.CLOTURE,
        models.TicketStatus.RESOLU,
        models.TicketStatus.RETRAITE,
        models.TicketStatus.REJETE
    ]
    if ticket.technician_id is not None or ticket.status in blocked_statuses:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Le ticket est déjà en cours de traitement")

    if ticket_in.title is not None:
        ticket.title = ticket_in.title
    if ticket_in.description is not None:
        ticket.description = ticket_in.description
    if ticket_in.type is not None:
        ticket.type = ticket_in.type
    if ticket_in.priority is not None:
        ticket.priority = ticket_in.priority
        ticket.priority_id = _get_priority_id_from_enum(db, ticket_in.priority)
    if ticket_in.category is not None:
        ticket.category = ticket_in.category

    history = models.TicketHistory(
        ticket_id=ticket.id,
        old_status=ticket.status,
        new_status=ticket.status,
        user_id=current_user.id,
        reason="Ticket modifié par l'utilisateur",
    )
    db.add(history)

    db.commit()
    db.refresh(ticket)

    ticket = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
        .filter(models.Ticket.id == ticket.id)
        .first()
    )
    return ticket


@router.delete("/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    if ticket.creator_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Bloquer la suppression si le ticket est assigné ou dans un statut bloqué
    blocked_statuses = [
        models.TicketStatus.ASSIGNE_TECHNICIEN,
        models.TicketStatus.EN_COURS,
        models.TicketStatus.CLOTURE,
        models.TicketStatus.RESOLU,
        models.TicketStatus.RETRAITE,
        models.TicketStatus.REJETE
    ]
    if ticket.technician_id is not None or ticket.status in blocked_statuses:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Le ticket est déjà en cours de traitement")

    # Supprimer les notifications liées au ticket avant de supprimer le ticket
    try:
        db.query(models.Notification).filter(models.Notification.ticket_id == ticket.id).delete()
        # Les comments et history sont supprimés automatiquement grâce au cascade
        db.delete(ticket)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[DELETE] Erreur lors de la suppression du ticket: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la suppression du ticket: {str(e)}"
        )


@router.put("/{ticket_id}/assign", response_model=schemas.TicketRead)
def assign_ticket(
    ticket_id: int,
    assign_data: schemas.TicketAssign,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_role("Secrétaire DSI", "Adjoint DSI", "DSI", "Admin")
    ),
):
    """Assigner un ticket à un technicien"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )
    
    # Vérifier que le technicien existe
    technician = db.query(models.User).filter(models.User.id == assign_data.technician_id).first()
    if not technician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found"
        )
    
    # Enregistrer l'ancien statut pour l'historique
    old_status = ticket.status
    
    # Assigner le ticket
    ticket.technician_id = assign_data.technician_id
    ticket.secretary_id = current_user.id
    ticket.status = models.TicketStatus.ASSIGNE_TECHNICIEN
    ticket.assigned_at = datetime.utcnow()
    if assign_data.priority is not None:
        ticket.priority = assign_data.priority
        ticket.priority_id = _get_priority_id_from_enum(db, assign_data.priority)

    # Créer une entrée d'historique avec notes/instructions
    history_reason = assign_data.reason or ""
    if assign_data.notes:
        history_reason += f" | Instructions: {assign_data.notes}"
    
    history = models.TicketHistory(
        ticket_id=ticket.id,
        old_status=old_status,
        new_status=ticket.status,
        user_id=current_user.id,
        reason=history_reason,
    )
    db.add(history)
    
    # Créer une notification pour le technicien
    notification = models.Notification(
        user_id=assign_data.technician_id,
        type=models.NotificationType.ASSIGNATION,
        ticket_id=ticket.id,
        message=f"Un nouveau ticket #{ticket.number} vous a été assigné: {ticket.title}",
        read=False
    )
    db.add(notification)
    
    # Créer une notification pour le créateur du ticket
    creator_notification = models.Notification(
        user_id=ticket.creator_id,
        type=models.NotificationType.TICKET_ASSIGNE,
        ticket_id=ticket.id,
        message=f"Votre ticket #{ticket.number} a été assigné à un technicien: {ticket.title}",
        read=False
    )
    db.add(creator_notification)
    
    db.commit()
    db.refresh(ticket)
    
    # Récupérer le créateur du ticket pour l'email
    creator = db.query(models.User).filter(models.User.id == ticket.creator_id).first()
    
    # Envoyer les emails en arrière-plan (asynchrone)
    if technician.email and technician.email.strip():
        background_tasks.add_task(
            email_service.send_ticket_assigned_notification,
            ticket_id=str(ticket.id),
            ticket_number=ticket.number,
            ticket_title=ticket.title,
            technician_email=technician.email,
            technician_name=technician.full_name,
            priority=ticket.priority,
            notes=assign_data.notes
        )
    
    if creator and creator.email and creator.email.strip():
        background_tasks.add_task(
            email_service.send_ticket_assigned_to_creator_notification,
            ticket_id=str(ticket.id),
            ticket_number=ticket.number,
            ticket_title=ticket.title,
            creator_email=creator.email,
            creator_name=creator.full_name,
            technician_name=technician.full_name
        )
    
    # Charger les relations pour la réponse
    ticket = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
        .filter(models.Ticket.id == ticket.id)
        .first()
    )
    
    return ticket


@router.put("/{ticket_id}/reassign", response_model=schemas.TicketRead)
def reassign_ticket(
    ticket_id: int,
    assign_data: schemas.TicketAssign,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_role("Secrétaire DSI", "Adjoint DSI", "DSI", "Admin")
    ),
):
    """Réassigner un ticket à un autre technicien"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )
    
    # Vérifier que le ticket est déjà assigné
    if not ticket.technician_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ticket is not assigned yet. Use /assign instead."
        )
    
    # Vérifier que le technicien existe
    technician = db.query(models.User).filter(models.User.id == assign_data.technician_id).first()
    if not technician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found"
        )
    
    # Vérifier qu'on ne réassigne pas au même technicien
    if ticket.technician_id == assign_data.technician_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ticket is already assigned to this technician"
        )
    
    old_status = ticket.status
    old_technician_id = ticket.technician_id
    
    # Réassigner le ticket
    ticket.technician_id = assign_data.technician_id
    ticket.secretary_id = current_user.id
    ticket.assigned_at = datetime.utcnow()
    # Le statut reste le même ou passe à ASSIGNE_TECHNICIEN si nécessaire
    if ticket.status == models.TicketStatus.EN_ATTENTE_ANALYSE:
        ticket.status = models.TicketStatus.ASSIGNE_TECHNICIEN
    
    # Créer une entrée d'historique
    history = models.TicketHistory(
        ticket_id=ticket.id,
        old_status=old_status,
        new_status=ticket.status,
        user_id=current_user.id,
        reason=f"Réassigné depuis {old_technician_id} vers {assign_data.technician_id}. {assign_data.reason or ''}",
    )
    db.add(history)
    
    # Créer une notification pour le nouveau technicien
    notification = models.Notification(
        user_id=assign_data.technician_id,
        type=models.NotificationType.ASSIGNATION,
        ticket_id=ticket.id,
        message=f"Le ticket #{ticket.number} vous a été réassigné: {ticket.title}",
        read=False
    )
    db.add(notification)
    
    # Créer une notification pour l'ancien technicien
    old_technician = db.query(models.User).filter(models.User.id == old_technician_id).first()
    if old_technician:
        old_notification = models.Notification(
            user_id=old_technician_id,
            type=models.NotificationType.REASSIGNATION,
            ticket_id=ticket.id,
            message=f"Le ticket #{ticket.number} ne vous est plus assigné: {ticket.title}",
            read=False
        )
        db.add(old_notification)
    
    # Créer une notification pour le créateur du ticket
    creator_notification = models.Notification(
        user_id=ticket.creator_id,
        type=models.NotificationType.TECHNICIEN_CHANGE,
        ticket_id=ticket.id,
        message=f"Votre ticket #{ticket.number} a été réassigné à un autre technicien: {ticket.title}",
        read=False
    )
    db.add(creator_notification)
    
    # Récupérer le créateur pour l'email
    creator = db.query(models.User).filter(models.User.id == ticket.creator_id).first()
    old_technician_name = old_technician.full_name if old_technician else None
    
    db.commit()
    db.refresh(ticket)
    
    # Envoyer un email de notification au nouveau technicien en arrière-plan (asynchrone)
    if technician.email and technician.email.strip():
        background_tasks.add_task(
            email_service.send_ticket_assigned_notification,
            ticket_id=str(ticket.id),
            ticket_number=ticket.number,
            ticket_title=ticket.title,
            technician_email=technician.email,
            technician_name=technician.full_name,
            priority=ticket.priority,
            notes=assign_data.notes or assign_data.reason
        )
    
    # Envoyer un email au créateur pour le changement de technicien
    if creator and creator.email and creator.email.strip():
        background_tasks.add_task(
            email_service.send_technician_changed_notification,
            ticket_id=str(ticket.id),
            ticket_number=ticket.number,
            ticket_title=ticket.title,
            creator_email=creator.email,
            creator_name=creator.full_name,
            old_technician_name=old_technician_name,
            new_technician_name=technician.full_name
        )
    
    # Charger les relations pour la réponse
    ticket = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
        .filter(models.Ticket.id == ticket.id)
        .first()
    )
    
    return ticket


@router.put("/{ticket_id}/escalate", response_model=schemas.TicketRead)
def escalate_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_role("Adjoint DSI", "DSI", "Admin")
    ),
):
    """Escalader un ticket (augmenter la priorité)"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )
    
    old_priority = ticket.priority
    old_status = ticket.status
    
    # Augmenter la priorité (si priorité non encore définie, passer à Moyenne)
    if ticket.priority is None:
        ticket.priority = models.TicketPriority.MOYENNE
    elif ticket.priority == models.TicketPriority.FAIBLE:
        ticket.priority = models.TicketPriority.MOYENNE
    elif ticket.priority == models.TicketPriority.MOYENNE:
        ticket.priority = models.TicketPriority.HAUTE
    elif ticket.priority == models.TicketPriority.HAUTE:
        ticket.priority = models.TicketPriority.CRITIQUE
    # Si déjà critique, on ne peut plus escalader
    ticket.priority_id = _get_priority_id_from_enum(db, ticket.priority)

    if ticket.priority == old_priority:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ticket priority is already at maximum (Critique)"
        )
    
    # Créer une entrée d'historique
    history = models.TicketHistory(
        ticket_id=ticket.id,
        old_status=old_status,
        new_status=ticket.status,
        user_id=current_user.id,
        reason=f"Ticket escaladé : priorité passée de {old_priority} à {ticket.priority}",
    )
    db.add(history)
    
    # Créer des notifications pour DSI et Adjoints DSI
    dsi_roles = db.query(models.Role).filter(
        models.Role.name.in_(["DSI", "Adjoint DSI"])
    ).all()
    
    for role in dsi_roles:
        dsi_users = db.query(models.User).filter(
            models.User.role_id == role.id,
            models.User.actif == True
        ).all()
        for dsi_user in dsi_users:
            # Ne pas notifier l'utilisateur qui a escaladé
            if dsi_user.id != current_user.id:
                escalation_notification = models.Notification(
                    user_id=dsi_user.id,
                    type=models.NotificationType.ESCALADE,
                    ticket_id=ticket.id,
                    message=f"Ticket #{ticket.number} escaladé à la priorité {ticket.priority}: {ticket.title}",
                    read=False
                )
                db.add(escalation_notification)
    
    # Notifier aussi le technicien assigné s'il existe
    if ticket.technician_id:
        tech_notification = models.Notification(
            user_id=ticket.technician_id,
            type=models.NotificationType.ESCALADE,
            ticket_id=ticket.id,
            message=f"Le ticket #{ticket.number} que vous avez en charge a été escaladé à la priorité {ticket.priority}: {ticket.title}",
            read=False
        )
        db.add(tech_notification)
    
    # Notifier le créateur du ticket
    creator_notification = models.Notification(
        user_id=ticket.creator_id,
        type=models.NotificationType.ESCALADE,
        ticket_id=ticket.id,
        message=f"Votre ticket #{ticket.number} a été escaladé à la priorité {ticket.priority}: {ticket.title}",
        read=False
    )
    db.add(creator_notification)
    
    db.commit()
    db.refresh(ticket)
    
    # Charger les relations pour la réponse
    ticket = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
        .filter(models.Ticket.id == ticket.id)
        .first()
    )
    
    return ticket


@router.put("/{ticket_id}/status", response_model=schemas.TicketRead)
def update_ticket_status(
    ticket_id: int,
    status_update: schemas.TicketUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Mettre à jour le statut d'un ticket"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )
    
    # Récupérer le créateur pour les emails
    creator = db.query(models.User).filter(models.User.id == ticket.creator_id).first()
    technician = db.query(models.User).filter(models.User.id == ticket.technician_id).first() if ticket.technician_id else None
    
    # Statut effectif à enregistrer (pour RESOLU → RETRAITE si le ticket a déjà été relancé)
    effective_new_status = status_update.status

    # Vérifier les permissions selon le statut
    if status_update.status == models.TicketStatus.RESOLU:
        # Seul le technicien assigné peut marquer comme résolu
        if ticket.technician_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only assigned technician can mark as resolved"
            )
        # Si le ticket a déjà été relancé (rejete) par l'utilisateur, enregistrer comme Retraité au lieu de Résolu
        has_been_relanced = (
            db.query(models.TicketHistory)
            .filter(
                models.TicketHistory.ticket_id == ticket.id,
                models.TicketHistory.new_status == models.TicketStatus.REJETE,
            )
            .first()
            is not None
        )
        if has_been_relanced:
            effective_new_status = models.TicketStatus.RETRAITE

        ticket.resolved_at = datetime.utcnow()
        
        # Créer une notification pour l'utilisateur créateur
        notification = models.Notification(
            user_id=ticket.creator_id,
            type=models.NotificationType.TICKET_RESOLU,
            ticket_id=ticket.id,
            message=f"Votre ticket #{ticket.number} a été résolu. Veuillez valider la résolution.",
            read=False
        )
        db.add(notification)
        
        # Envoyer un email au créateur
        if creator and creator.email and creator.email.strip():
            background_tasks.add_task(
                email_service.send_ticket_resolved_notification,
                ticket_id=str(ticket.id),
                ticket_number=ticket.number,
                ticket_title=ticket.title,
                creator_email=creator.email,
                creator_name=creator.full_name,
                resolution_summary=status_update.resolution_summary
            )
    elif status_update.status == models.TicketStatus.CLOTURE:
        # Seuls secrétaire/adjoint/DSI/Admin peuvent clôturer
        if not current_user.role or current_user.role.name not in ["Secrétaire DSI", "Adjoint DSI", "DSI", "Admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only agents can close tickets"
            )
        ticket.closed_at = datetime.utcnow()
        
        # Créer une notification pour le créateur du ticket
        creator_notification = models.Notification(
            user_id=ticket.creator_id,
            type=models.NotificationType.TICKET_CLOTURE,
            ticket_id=ticket.id,
            message=f"Votre ticket #{ticket.number} a été clôturé: {ticket.title}",
            read=False
        )
        db.add(creator_notification)
        
        # Envoyer un email au créateur
        if creator and creator.email and creator.email.strip():
            background_tasks.add_task(
                email_service.send_ticket_closed_notification_to_user,
                ticket_id=str(ticket.id),
                ticket_number=ticket.number,
                ticket_title=ticket.title,
                creator_email=creator.email,
                creator_name=creator.full_name
            )
        
        # Créer une notification pour le technicien assigné s'il existe
        if ticket.technician_id:
            tech_notification = models.Notification(
                user_id=ticket.technician_id,
                type=models.NotificationType.TICKET_CLOTURE,
                ticket_id=ticket.id,
                message=f"Le ticket #{ticket.number} que vous avez résolu a été clôturé: {ticket.title}",
                read=False
            )
            db.add(tech_notification)
    elif status_update.status == models.TicketStatus.EN_COURS:
        # Le technicien assigné peut mettre en cours
        if ticket.technician_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only assigned technician can set in progress"
            )
        
        # Créer une notification pour l'utilisateur créateur
        creator_notification = models.Notification(
            user_id=ticket.creator_id,
            type=models.NotificationType.TICKET_EN_COURS,
            ticket_id=ticket.id,
            message=f"Votre ticket #{ticket.number} est maintenant en cours de traitement: {ticket.title}",
            read=False
        )
        db.add(creator_notification)
        
        # Envoyer un email au créateur
        if creator and creator.email and creator.email.strip() and technician:
            background_tasks.add_task(
                email_service.send_ticket_in_progress_notification,
                ticket_id=str(ticket.id),
                ticket_number=ticket.number,
                ticket_title=ticket.title,
                creator_email=creator.email,
                creator_name=creator.full_name,
                technician_name=technician.full_name
            )
    elif status_update.status == models.TicketStatus.REJETE:
        # Créer une notification pour l'utilisateur créateur
        creator_notification = models.Notification(
            user_id=ticket.creator_id,
            type=models.NotificationType.TICKET_REJETE,
            ticket_id=ticket.id,
            message=f"Votre ticket #{ticket.number} a été rejeté: {ticket.title}",
            read=False
        )
        db.add(creator_notification)
        
        # Envoyer un email au créateur
        if creator and creator.email and creator.email.strip():
            background_tasks.add_task(
                email_service.send_ticket_rejected_notification_to_user,
                ticket_id=str(ticket.id),
                ticket_number=ticket.number,
                ticket_title=ticket.title,
                creator_email=creator.email,
                creator_name=creator.full_name,
                rejection_reason=status_update.rejection_reason if hasattr(status_update, 'rejection_reason') else None
            )
    
    old_status = ticket.status
    ticket.status = effective_new_status
    
    # Créer une entrée d'historique avec résumé si résolu/retraité
    history_reason = None
    if status_update.status == models.TicketStatus.RESOLU and status_update.resolution_summary:
        history_reason = f"Résumé de la résolution: {status_update.resolution_summary}"
    
    history = models.TicketHistory(
        ticket_id=ticket.id,
        old_status=old_status,
        new_status=effective_new_status,
        user_id=current_user.id,
        reason=history_reason,
    )
    db.add(history)
    db.commit()
    db.refresh(ticket)
    
    # Charger les relations pour la réponse
    ticket = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
        .filter(models.Ticket.id == ticket.id)
        .first()
    )
    
    return ticket


@router.post("/{ticket_id}/comments", response_model=schemas.CommentRead)
def add_comment(
    ticket_id: int,
    comment_in: schemas.CommentCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Ajouter un commentaire à un ticket"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )
    
    comment = models.Comment(
        ticket_id=ticket_id,
        user_id=current_user.id,
        content=comment_in.content,
        type=comment_in.type,
    )
    db.add(comment)
    # Inscrire l'ajout du commentaire dans l'historique du ticket
    comment_reason = f"Commentaire: {comment_in.content}"
    history = models.TicketHistory(
        ticket_id=ticket_id,
        old_status=ticket.status,
        new_status=ticket.status,
        user_id=current_user.id,
        reason=comment_reason,
    )
    db.add(history)
    db.commit()
    db.refresh(comment)
    
    # Si le commentaire n'est pas de l'utilisateur créateur, notifier le créateur
    if ticket.creator_id != current_user.id:
        creator = db.query(models.User).filter(models.User.id == ticket.creator_id).first()
        if creator:
            # Créer une notification pour le créateur
            notification = models.Notification(
                user_id=ticket.creator_id,
                type=models.NotificationType.COMMENTAIRE,
                ticket_id=ticket.id,
                message=f"Un nouveau commentaire a été ajouté sur votre ticket #{ticket.number}: {ticket.title}",
                read=False
            )
            db.add(notification)
            db.commit()
            
            # Envoyer un email au créateur
            if creator.email and creator.email.strip():
                background_tasks.add_task(
                    email_service.send_comment_notification_to_user,
                    ticket_id=str(ticket.id),
                    ticket_number=ticket.number,
                    ticket_title=ticket.title,
                    creator_email=creator.email,
                    creator_name=creator.full_name,
                    commenter_name=current_user.full_name,
                    comment_content=comment_in.content
                )
    
    return comment


@router.get("/{ticket_id}/comments", response_model=List[schemas.CommentRead])
def get_ticket_comments(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Récupérer tous les commentaires d'un ticket"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )
    
    comments = (
        db.query(models.Comment)
        .filter(models.Comment.ticket_id == ticket_id)
        .order_by(models.Comment.created_at.asc())
        .all()
    )
    return comments


@router.put("/{ticket_id}/validate", response_model=schemas.TicketRead)
def validate_ticket_resolution(
    ticket_id: int,
    validation: schemas.TicketValidation,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Valider ou rejeter la résolution d'un ticket (par le créateur du ticket)"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )
    
    # Vérifier que c'est le créateur du ticket
    if ticket.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only ticket creator can validate resolution"
        )
    
    # Vérifier que le ticket est en statut "résolu" ou "retraité" (validation possible dans les deux cas)
    if ticket.status not in (models.TicketStatus.RESOLU, models.TicketStatus.RETRAITE):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ticket must be resolved before validation"
        )
    
    old_status = ticket.status
    
    if validation.validated:
        # Utilisateur valide → Clôturer
        ticket.status = models.TicketStatus.CLOTURE
        ticket.closed_at = datetime.utcnow()
        history_reason = "Validation utilisateur: Validé"
        
        # Récupérer le créateur pour l'email
        creator = db.query(models.User).filter(models.User.id == ticket.creator_id).first()
        
        # Créer une notification pour le créateur
        creator_notification = models.Notification(
            user_id=ticket.creator_id,
            type=models.NotificationType.TICKET_CLOTURE,
            ticket_id=ticket.id,
            message=f"Votre ticket #{ticket.number} a été clôturé: {ticket.title}",
            read=False
        )
        db.add(creator_notification)
        
        # Envoyer un email au créateur
        if creator and creator.email and creator.email.strip():
            background_tasks.add_task(
                email_service.send_ticket_closed_notification_to_user,
                ticket_id=str(ticket.id),
                ticket_number=ticket.number,
                ticket_title=ticket.title,
                creator_email=creator.email,
                creator_name=creator.full_name
            )
        
        # Créer une notification pour le technicien assigné
        if ticket.technician_id:
            validation_notification = models.Notification(
                user_id=ticket.technician_id,
                type=models.NotificationType.TICKET_CLOTURE,
                ticket_id=ticket.id,
                message=f"Votre résolution du ticket #{ticket.number} a été validée par l'utilisateur: {ticket.title}",
                read=False
            )
            db.add(validation_notification)
    else:
        # Utilisateur rejette → Rejeter
        ticket.status = models.TicketStatus.REJETE
        
        # Vérifier que le motif de rejet est fourni
        if not validation.rejection_reason or not validation.rejection_reason.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Un motif de rejet est requis"
            )
        
        # Construire le message avec le motif
        rejection_message = f"L'utilisateur a rejeté la résolution du ticket #{ticket.number}."
        if validation.rejection_reason:
            rejection_message += f" Motif: {validation.rejection_reason}"
        
        # Notifier le technicien assigné avec le motif
        if ticket.technician_id:
            notification = models.Notification(
                user_id=ticket.technician_id,
                type=models.NotificationType.REJET_RESOLUTION,
                ticket_id=ticket.id,
                message=rejection_message,
                read=False
            )
            db.add(notification)
            technician = db.query(models.User).filter(models.User.id == ticket.technician_id).first()
            if technician and technician.email and technician.email.strip():
                # Envoyer l'email de rejet en arrière-plan pour ne pas bloquer la réponse API
                background_tasks.add_task(
                    email_service.send_ticket_rejected_notification,
                    ticket_number=ticket.number,
                    ticket_title=ticket.title,
                    technician_email=technician.email,
                    technician_name=technician.full_name,
                    rejection_reason=validation.rejection_reason,
                )
        
        # Notifier DSI, Adjoints DSI et Secrétaires DSI
        admin_roles = db.query(models.Role).filter(
            models.Role.name.in_(["DSI", "Adjoint DSI", "Secrétaire DSI"])
        ).all()
        
        for role in admin_roles:
            admin_users = db.query(models.User).filter(
                models.User.role_id == role.id,
                models.User.actif == True
            ).all()
            for admin_user in admin_users:
                admin_notification = models.Notification(
                    user_id=admin_user.id,
                    type=models.NotificationType.REJET_RESOLUTION,
                    ticket_id=ticket.id,
                    message=f"L'utilisateur a rejeté la résolution du ticket #{ticket.number}: {ticket.title}. Motif: {validation.rejection_reason}",
                    read=False
                )
                db.add(admin_notification)
        
        # Construire la raison pour l'historique avec le motif
        history_reason = f"Validation utilisateur: Rejeté. Motif: {validation.rejection_reason}"
    
    # Créer une entrée d'historique
    history = models.TicketHistory(
        ticket_id=ticket.id,
        old_status=old_status,
        new_status=ticket.status,
        user_id=current_user.id,
        reason=history_reason
    )
    db.add(history)
    db.commit()
    db.refresh(ticket)
    
    # Charger les relations pour la réponse
    ticket = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
        .filter(models.Ticket.id == ticket.id)
        .first()
    )
    return ticket

@router.put("/{ticket_id}/delegate-adjoint", response_model=schemas.TicketRead)
def delegate_to_adjoint(
    ticket_id: int,
    delegate_data: schemas.TicketDelegate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("DSI")),
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )
    adjoint = db.query(models.User).filter(models.User.id == delegate_data.adjoint_id).first()
    if not adjoint or not adjoint.role or adjoint.role.name != "Adjoint DSI":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Adjoint DSI not found"
        )
    old_status = ticket.status
    ticket.technician_id = None
    ticket.secretary_id = delegate_data.adjoint_id
    if ticket.status != models.TicketStatus.EN_ATTENTE_ANALYSE:
        ticket.status = models.TicketStatus.EN_ATTENTE_ANALYSE
    history_reason = delegate_data.reason or ""
    if delegate_data.notes:
        history_reason = (history_reason + " | " + delegate_data.notes).strip(" |")
    history = models.TicketHistory(
        ticket_id=ticket.id,
        old_status=old_status,
        new_status=ticket.status,
        user_id=current_user.id,
        reason=history_reason or "Délégation au Adjoint DSI"
    )
    db.add(history)
    notification = models.Notification(
        user_id=delegate_data.adjoint_id,
        type=models.NotificationType.TICKET_EN_ATTENTE,
        ticket_id=ticket.id,
        message=f"Ticket #{ticket.number} délégué par DSI: {ticket.title}",
        read=False
    )
    db.add(notification)
    db.commit()
    
    # Envoyer un email à l'adjoint DSI en arrière-plan
    if adjoint.email and adjoint.email.strip():
        background_tasks.add_task(
            email_service.send_ticket_delegated_to_adjoint_notification,
            ticket_id=str(ticket.id),
            ticket_number=ticket.number,
            ticket_title=ticket.title,
            adjoint_email=adjoint.email,
            adjoint_name=adjoint.full_name,
            dsi_name=current_user.full_name,
            notes=delegate_data.notes
        )
    
    db.refresh(ticket)
    ticket = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
        .filter(models.Ticket.id == ticket.id)
        .first()
    )
    return ticket


@router.put("/{ticket_id}/accept-assignment", response_model=schemas.TicketRead)
def accept_assignment(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Accepter une assignation de ticket"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )
    
    # Vérifier que le ticket est assigné au technicien connecté
    if ticket.technician_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This ticket is not assigned to you"
        )
    
    if ticket.status != models.TicketStatus.ASSIGNE_TECHNICIEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ticket is not in assigned status"
        )
    
    # Le technicien accepte, le statut reste "assigné" (il peut ensuite "prendre en charge")
    # On crée une entrée d'historique pour tracer l'acceptation
    history = models.TicketHistory(
        ticket_id=ticket.id,
        old_status=ticket.status,
        new_status=ticket.status,
        user_id=current_user.id,
        reason="Assignation acceptée par le technicien"
    )
    db.add(history)
    db.commit()
    db.refresh(ticket)
    
    ticket = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
        .filter(models.Ticket.id == ticket.id)
        .first()
    )
    return ticket


@router.put("/{ticket_id}/reject-assignment", response_model=schemas.TicketRead)
def reject_assignment(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    reason: Optional[str] = Query(None),
):
    """Refuser une assignation de ticket (demande de réassignation)"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )
    
    # Vérifier que le ticket est assigné au technicien connecté
    if ticket.technician_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This ticket is not assigned to you"
        )
    
    if ticket.status != models.TicketStatus.ASSIGNE_TECHNICIEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ticket is not in assigned status"
        )
    
    # Remettre le ticket en attente d'analyse pour réassignation
    old_status = ticket.status
    ticket.technician_id = None
    ticket.status = models.TicketStatus.EN_ATTENTE_ANALYSE
    
    # Créer une entrée d'historique
    history = models.TicketHistory(
        ticket_id=ticket.id,
        old_status=old_status,
        new_status=ticket.status,
        user_id=current_user.id,
        reason=f"Assignation refusée par le technicien. Raison: {reason or 'N/A'}"
    )
    db.add(history)
    
    # Notifier le secrétaire/adjoint
    if ticket.secretary_id:
        notification = models.Notification(
            user_id=ticket.secretary_id,
            type=models.NotificationType.ASSIGNATION,
            ticket_id=ticket.id,
            message=f"Le technicien a refusé l'assignation du ticket #{ticket.number}. Réassignation nécessaire.",
            read=False
        )
        db.add(notification)
    
    db.commit()
    db.refresh(ticket)
    
    ticket = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
        .filter(models.Ticket.id == ticket.id)
        .first()
    )
    return ticket


@router.put("/{ticket_id}/feedback", response_model=schemas.TicketRead)
def submit_ticket_feedback(
    ticket_id: int,
    feedback: schemas.TicketFeedback,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Soumettre le feedback/satisfaction pour un ticket clôturé"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )
    
    # Vérifier que c'est le créateur du ticket
    if ticket.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only ticket creator can submit feedback"
        )
    
    # Vérifier que le ticket est clôturé
    if ticket.status != models.TicketStatus.CLOTURE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Feedback can only be submitted for closed tickets"
        )
    
    # Vérifier le score (1-5)
    if feedback.score < 1 or feedback.score > 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Score must be between 1 and 5"
        )
    
    # Enregistrer le feedback
    ticket.feedback_score = feedback.score
    ticket.feedback_comment = feedback.comment
    
    db.commit()
    db.refresh(ticket)
    
    # Charger les relations pour la réponse
    ticket = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
        .filter(models.Ticket.id == ticket.id)
        .first()
    )
    return ticket


@router.put("/{ticket_id}/reopen-by-user", response_model=schemas.TicketRead)
def reopen_ticket_by_user(
    ticket_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Permet à l'utilisateur créateur de réouvrir un ticket clôturé automatiquement (dans les 7 jours)"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )
    
    # Vérifier que c'est le créateur du ticket
    if ticket.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only ticket creator can reopen this ticket"
        )
    
    # Vérifier que le ticket a été clôturé automatiquement
    if not ticket.auto_closed_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This ticket was not auto-closed. Use the regular reopen endpoint."
        )
    
    # Vérifier que le ticket est clôturé
    if ticket.status != models.TicketStatus.CLOTURE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ticket is not closed"
        )
    
    # Vérifier que moins de 7 jours se sont écoulés depuis la clôture automatique
    now = datetime.utcnow()
    days_since_auto_close = (now - ticket.auto_closed_at).days
    if days_since_auto_close > 7:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The 7-day period to reopen this ticket has expired. Please create a new ticket."
        )
    
    old_status = ticket.status
    
    # Réouvrir le ticket : remettre en attente d'analyse
    ticket.status = models.TicketStatus.EN_ATTENTE_ANALYSE
    ticket.auto_closed_at = None  # Réinitialiser le flag de clôture automatique
    ticket.closed_at = None  # Réinitialiser la date de clôture
    ticket.resolved_at = None  # Réinitialiser la date de résolution
    ticket.technician_id = None  # Retirer l'assignation du technicien
    
    # Créer une entrée d'historique
    history = models.TicketHistory(
        ticket_id=ticket.id,
        old_status=old_status,
        new_status=ticket.status,
        user_id=current_user.id,
        reason="Ticket réouvert par l'utilisateur après clôture automatique"
    )
    db.add(history)
    
    # Créer une notification pour le créateur
    creator_notification = models.Notification(
        user_id=ticket.creator_id,
        type=models.NotificationType.TICKET_REOUVERT,
        ticket_id=ticket.id,
        message=f"Votre ticket #{ticket.number} a été réouvert: {ticket.title}",
        read=False
    )
    db.add(creator_notification)
    
    # Notifier les secrétaires/adjoints/DSI
    target_roles = db.query(models.Role).filter(
        models.Role.name.in_(["Secrétaire DSI", "Adjoint DSI", "DSI", "Admin"])
    ).all()
    
    for role in target_roles:
        users = (
            db.query(models.User)
            .options(joinedload(models.User.role))
            .filter(
                models.User.role_id == role.id,
                models.User.actif == True
            )
            .all()
        )
        for user in users:
            notification = models.Notification(
                user_id=user.id,
                type=models.NotificationType.NOUVEAU_TICKET,
                ticket_id=ticket.id,
                message=f"Ticket #{ticket.number} réouvert par l'utilisateur: {ticket.title}",
                read=False
            )
            db.add(notification)
    
    db.commit()
    db.refresh(ticket)
    
    # Envoyer un email au créateur
    creator = db.query(models.User).filter(models.User.id == ticket.creator_id).first()
    if creator and creator.email and creator.email.strip():
        background_tasks.add_task(
            email_service.send_ticket_reopened_notification,
            ticket_id=str(ticket.id),
            ticket_number=ticket.number,
            ticket_title=ticket.title,
            creator_email=creator.email,
            creator_name=creator.full_name
        )
    
    # Charger les relations pour la réponse
    ticket = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
        .filter(models.Ticket.id == ticket.id)
        .first()
    )
    
    return ticket


@router.put("/{ticket_id}/reopen", response_model=schemas.TicketRead)
def reopen_ticket(
    ticket_id: int,
    assign_data: schemas.TicketAssign,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_role("Secrétaire DSI", "Adjoint DSI", "DSI", "Admin")
    ),
):
    """Réouvrir un ticket rejeté et le réassigner à un technicien"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )
    
    # Vérifier que le ticket est rejeté
    if ticket.status != models.TicketStatus.REJETE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only rejected tickets can be reopened"
        )
    
    # Vérifier que le technicien existe
    technician = db.query(models.User).filter(models.User.id == assign_data.technician_id).first()
    if not technician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found"
        )
    
    old_status = ticket.status
    
    # Réassigner et remettre en statut "assigné"
    ticket.technician_id = assign_data.technician_id
    ticket.secretary_id = current_user.id
    ticket.status = models.TicketStatus.ASSIGNE_TECHNICIEN
    ticket.assigned_at = datetime.utcnow()
    
    # Créer une entrée d'historique
    history = models.TicketHistory(
        ticket_id=ticket.id,
        old_status=old_status,
        new_status=ticket.status,
        user_id=current_user.id,
        reason=f"Ticket réouvert et réassigné. Raison: {assign_data.reason or 'N/A'}"
    )
    db.add(history)
    # Récupérer le créateur pour l'email
    creator = db.query(models.User).filter(models.User.id == ticket.creator_id).first()
    
    if ticket.creator_id:
        creator_notification = models.Notification(
            user_id=ticket.creator_id,
            type=models.NotificationType.TICKET_REOUVERT,
            ticket_id=ticket.id,
            message=f"Votre ticket #{ticket.number} a été réouvert et réassigné: {ticket.title}",
            read=False
        )
        db.add(creator_notification)
    
    db.commit()
    db.refresh(ticket)
    
    # Envoyer un email au créateur
    if creator and creator.email and creator.email.strip():
        background_tasks.add_task(
            email_service.send_ticket_reopened_notification,
            ticket_id=str(ticket.id),
            ticket_number=ticket.number,
            ticket_title=ticket.title,
            creator_email=creator.email,
            creator_name=creator.full_name
        )
    
    # Charger les relations pour la réponse
    ticket = (
        db.query(models.Ticket)
        .options(
            joinedload(models.Ticket.creator),
            joinedload(models.Ticket.technician)
        )
        .filter(models.Ticket.id == ticket.id)
        .first()
    )
    return ticket


@router.get("/{ticket_id}/history", response_model=List[schemas.TicketHistoryRead])
def get_ticket_history(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Récupérer l'historique d'un ticket"""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found"
        )
    
    # Vérifier les permissions : créateur, technicien assigné, ou agent/DSI
    is_creator = ticket.creator_id == current_user.id
    is_assigned_tech = ticket.technician_id == current_user.id
    is_agent = current_user.role and current_user.role.name in ["Secrétaire DSI", "Adjoint DSI", "DSI", "Admin"]
    
    if not (is_creator or is_assigned_tech or is_agent):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
        )
    
    history = (
        db.query(models.TicketHistory)
        .options(joinedload(models.TicketHistory.user))
        .filter(models.TicketHistory.ticket_id == ticket_id)
        .order_by(models.TicketHistory.changed_at.desc())
        .all()
    )
    
    return history
