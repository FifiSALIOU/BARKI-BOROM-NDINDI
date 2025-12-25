"""
Système de tâches planifiées pour les notifications et clôtures automatiques
"""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from typing import List

from .database import SessionLocal
from . import models
from .email_service import email_service


def check_validation_reminders():
    """
    Vérifie les tickets résolus non validés et envoie des rappels
    Rappels à 3, 7 et 10 jours après résolution
    """
    db: Session = SessionLocal()
    try:
        # Récupérer tous les tickets résolus non clôturés
        resolved_tickets = (
            db.query(models.Ticket)
            .filter(
                models.Ticket.status == models.TicketStatus.RESOLU,
                models.Ticket.resolved_at.isnot(None)
            )
            .all()
        )
        
        now = datetime.utcnow()
        
        for ticket in resolved_tickets:
            if not ticket.resolved_at:
                continue
                
            days_since_resolution = (now - ticket.resolved_at).days
            
            # Vérifier si des rappels ont déjà été envoyés
            existing_reminders = (
                db.query(models.Notification)
                .filter(
                    models.Notification.ticket_id == ticket.id,
                    models.Notification.user_id == ticket.creator_id,
                    models.Notification.type.in_([
                        models.NotificationType.RAPPEL_VALIDATION_1,
                        models.NotificationType.RAPPEL_VALIDATION_2,
                        models.NotificationType.RAPPEL_VALIDATION_3
                    ])
                )
                .all()
            )
            
            reminder_numbers_sent = set()
            for reminder in existing_reminders:
                if reminder.type == models.NotificationType.RAPPEL_VALIDATION_1:
                    reminder_numbers_sent.add(1)
                elif reminder.type == models.NotificationType.RAPPEL_VALIDATION_2:
                    reminder_numbers_sent.add(2)
                elif reminder.type == models.NotificationType.RAPPEL_VALIDATION_3:
                    reminder_numbers_sent.add(3)
            
            # Envoyer le premier rappel après 3 jours
            if days_since_resolution >= 3 and 1 not in reminder_numbers_sent:
                creator = db.query(models.User).filter(models.User.id == ticket.creator_id).first()
                if creator and creator.email and creator.email.strip():
                    # Créer la notification
                    notification = models.Notification(
                        user_id=ticket.creator_id,
                        type=models.NotificationType.RAPPEL_VALIDATION_1,
                        ticket_id=ticket.id,
                        message=f"Rappel : Veuillez valider la résolution de votre ticket #{ticket.number}",
                        read=False
                    )
                    db.add(notification)
                    db.commit()
                    
                    # Envoyer l'email
                    email_service.send_validation_reminder(
                        ticket_id=str(ticket.id),
                        ticket_number=ticket.number,
                        ticket_title=ticket.title,
                        creator_email=creator.email,
                        creator_name=creator.full_name,
                        reminder_number=1,
                        days_since_resolution=days_since_resolution
                    )
            
            # Envoyer le second rappel après 7 jours
            elif days_since_resolution >= 7 and 2 not in reminder_numbers_sent:
                creator = db.query(models.User).filter(models.User.id == ticket.creator_id).first()
                if creator and creator.email and creator.email.strip():
                    # Créer la notification
                    notification = models.Notification(
                        user_id=ticket.creator_id,
                        type=models.NotificationType.RAPPEL_VALIDATION_2,
                        ticket_id=ticket.id,
                        message=f"Second rappel : Validation requise pour votre ticket #{ticket.number}",
                        read=False
                    )
                    db.add(notification)
                    db.commit()
                    
                    # Envoyer l'email
                    email_service.send_validation_reminder(
                        ticket_id=str(ticket.id),
                        ticket_number=ticket.number,
                        ticket_title=ticket.title,
                        creator_email=creator.email,
                        creator_name=creator.full_name,
                        reminder_number=2,
                        days_since_resolution=days_since_resolution
                    )
            
            # Envoyer le troisième rappel après 10 jours
            elif days_since_resolution >= 10 and 3 not in reminder_numbers_sent:
                creator = db.query(models.User).filter(models.User.id == ticket.creator_id).first()
                if creator and creator.email and creator.email.strip():
                    # Créer la notification
                    notification = models.Notification(
                        user_id=ticket.creator_id,
                        type=models.NotificationType.RAPPEL_VALIDATION_3,
                        ticket_id=ticket.id,
                        message=f"Dernier rappel : Veuillez valider votre ticket #{ticket.number}",
                        read=False
                    )
                    db.add(notification)
                    db.commit()
                    
                    # Envoyer l'email
                    email_service.send_validation_reminder(
                        ticket_id=str(ticket.id),
                        ticket_number=ticket.number,
                        ticket_title=ticket.title,
                        creator_email=creator.email,
                        creator_name=creator.full_name,
                        reminder_number=3,
                        days_since_resolution=days_since_resolution
                    )
    
    except Exception as e:
        print(f"Erreur lors de la vérification des rappels de validation: {str(e)}")
        db.rollback()
    finally:
        db.close()


def auto_close_unvalidated_tickets():
    """
    Clôture automatiquement les tickets résolus non validés après 14 jours
    """
    db: Session = SessionLocal()
    try:
        # Récupérer tous les tickets résolus non clôturés depuis plus de 14 jours
        now = datetime.utcnow()
        cutoff_date = now - timedelta(days=14)
        
        unvalidated_tickets = (
            db.query(models.Ticket)
            .filter(
                models.Ticket.status == models.TicketStatus.RESOLU,
                models.Ticket.resolved_at.isnot(None),
                models.Ticket.resolved_at <= cutoff_date,
                models.Ticket.closed_at.is_(None)  # Pas encore clôturé
            )
            .all()
        )
        
        for ticket in unvalidated_tickets:
            # Clôturer le ticket automatiquement
            ticket.status = models.TicketStatus.CLOTURE
            ticket.closed_at = now
            ticket.auto_closed_at = now  # Marquer comme clôture automatique
            
            # Créer une entrée d'historique
            history = models.TicketHistory(
                ticket_id=ticket.id,
                old_status=models.TicketStatus.RESOLU,
                new_status=models.TicketStatus.CLOTURE,
                user_id=ticket.creator_id,  # Utiliser le créateur comme user_id pour l'historique
                reason="Clôture automatique après 14 jours sans validation"
            )
            db.add(history)
            
            # Créer une notification pour le créateur
            notification = models.Notification(
                user_id=ticket.creator_id,
                type=models.NotificationType.CLOTURE_AUTOMATIQUE,
                ticket_id=ticket.id,
                message=f"Votre ticket #{ticket.number} a été clôturé automatiquement après 14 jours sans validation. Vous pouvez le réouvrir dans les 7 prochains jours si nécessaire.",
                read=False
            )
            db.add(notification)
            
            # Récupérer le créateur pour l'email
            creator = db.query(models.User).filter(models.User.id == ticket.creator_id).first()
            if creator and creator.email and creator.email.strip():
                # Envoyer l'email
                email_service.send_ticket_auto_closed_notification(
                    ticket_id=str(ticket.id),
                    ticket_number=ticket.number,
                    ticket_title=ticket.title,
                    creator_email=creator.email,
                    creator_name=creator.full_name
                )
            
            # Notifier le technicien si assigné
            if ticket.technician_id:
                tech_notification = models.Notification(
                    user_id=ticket.technician_id,
                    type=models.NotificationType.TICKET_CLOTURE,
                    ticket_id=ticket.id,
                    message=f"Le ticket #{ticket.number} a été clôturé automatiquement après 14 jours sans validation: {ticket.title}",
                    read=False
                )
                db.add(tech_notification)
        
        db.commit()
        print(f"Clôture automatique: {len(unvalidated_tickets)} tickets clôturés")
    
    except Exception as e:
        print(f"Erreur lors de la clôture automatique: {str(e)}")
        db.rollback()
    finally:
        db.close()


def run_scheduled_tasks():
    """
    Fonction principale pour exécuter toutes les tâches planifiées
    À appeler périodiquement (ex: toutes les heures via cron ou APScheduler)
    """
    print(f"[{datetime.utcnow()}] Exécution des tâches planifiées...")
    check_validation_reminders()
    auto_close_unvalidated_tickets()
    print(f"[{datetime.utcnow()}] Tâches planifiées terminées")



