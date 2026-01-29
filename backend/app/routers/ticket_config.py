import unicodedata
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user


router = APIRouter(prefix="/ticket-config", tags=["ticket-config"])


@router.get("/types", response_model=List[schemas.TicketTypeConfig])
def get_ticket_types(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Récupère la liste des types de tickets configurés dans la base.
    Pour les admins, retourne tous les types (actifs et inactifs).
    Pour les autres utilisateurs, retourne uniquement les types actifs.
    """
    # Vérifier si l'utilisateur est admin
    is_admin = current_user.role and current_user.role.name == "Admin"
    
    query = db.query(models.TicketTypeModel)
    
    # Si ce n'est pas un admin, filtrer seulement les types actifs
    if not is_admin:
        query = query.filter(models.TicketTypeModel.is_active.is_(True))
    
    types = query.order_by(models.TicketTypeModel.label.asc()).all()
    return types


@router.post("/types", response_model=schemas.TicketTypeConfig)
def create_ticket_type(
    type_create: schemas.TicketTypeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Crée un nouveau type de ticket.
    Le code est généré automatiquement à partir du label (minuscules, espaces remplacés par des tirets).
    """
    # Générer le code à partir du label
    code = type_create.label.strip().lower().replace(" ", "-")
    # Nettoyer les caractères accentués pour le code
    code = "".join(c for c in unicodedata.normalize("NFD", code) if unicodedata.category(c) != "Mn")
    code = code or "type"

    existing = db.query(models.TicketTypeModel).filter(models.TicketTypeModel.code == code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Un type avec le code '{code}' existe déjà"
        )

    ticket_type = models.TicketTypeModel(
        code=code,
        label=type_create.label.strip(),
        is_active=type_create.is_active,
    )
    db.add(ticket_type)
    db.commit()
    db.refresh(ticket_type)

    return ticket_type


@router.get("/categories", response_model=List[schemas.TicketCategoryConfig])
def get_ticket_categories(
    type_code: Optional[str] = Query(None, description="Filtrer par code de type (materiel, applicatif, etc.)"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Récupère la liste des catégories de tickets configurées dans la base.
    Si un type_code est fourni, filtre les catégories pour ce type.
    """
    query = (
        db.query(models.TicketCategory)
        .options(joinedload(models.TicketCategory.ticket_type))
        .filter(models.TicketCategory.is_active.is_(True))
    )

    if type_code:
        # Filtrer par le code du type via la jointure
        query = query.join(models.TicketTypeModel).filter(models.TicketTypeModel.code == type_code)

    categories = query.order_by(models.TicketCategory.name.asc()).all()
    
    # Convertir en schéma avec type_code depuis la relation
    result = []
    for cat in categories:
        result.append(schemas.TicketCategoryConfig(
            id=cat.id,
            name=cat.name,
            description=cat.description,
            type_code=cat.ticket_type.code if cat.ticket_type else "",
            is_active=cat.is_active
        ))
    return result


@router.put("/types/{type_id}", response_model=schemas.TicketTypeConfig)
def update_ticket_type(
    type_id: int,
    type_update: schemas.TicketTypeUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Met à jour un type de ticket.
    """
    ticket_type = db.query(models.TicketTypeModel).filter(models.TicketTypeModel.id == type_id).first()
    if not ticket_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Type de ticket non trouvé"
        )
    
    if type_update.label is not None:
        ticket_type.label = type_update.label
    if type_update.is_active is not None:
        ticket_type.is_active = type_update.is_active
    
    db.commit()
    db.refresh(ticket_type)
    
    return ticket_type


