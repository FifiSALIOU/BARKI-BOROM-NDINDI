"""
Service d'envoi d'emails pour les notifications de tickets
"""
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Optional
from urllib.parse import urlencode
from dotenv import load_dotenv

load_dotenv()


class EmailService:
    """Service pour envoyer des emails via SMTP"""
    
    def __init__(self):
        # Récupérer les paramètres depuis les variables d'environnement
        # avec des valeurs par défaut
        self.smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_username = os.getenv("SMTP_USERNAME", "")
        self.smtp_password = os.getenv("SMTP_PASSWORD", "")
        self.sender_email = os.getenv("SENDER_EMAIL", "tickets@entreprise.com")
        self.sender_name = os.getenv("SENDER_NAME", "Système de Gestion des Tickets")
        self.use_tls = os.getenv("USE_TLS", "true").lower() == "true"
        self.verify_ssl = os.getenv("VERIFY_SSL", "true").lower() == "true"
        self.app_base_url = os.getenv("APP_BASE_URL", "http://localhost:5173")
        self.email_enabled = os.getenv("EMAIL_ENABLED", "true").lower() == "true"
    
    def _format_ticket_number(self, ticket_number: int) -> str:
        """Formate le numéro de ticket en TKT-XXX"""
        return f"TKT-{ticket_number:03d}"
    
    def _format_priority(self, priority: str) -> str:
        """Formate la priorité : TicketPriority.MOYENNE → Moyenne"""
        if not priority:
            return priority
        # Extraire la partie après le point si elle existe (ex: TicketPriority.MOYENNE → MOYENNE)
        if "." in priority:
            priority = priority.split(".")[-1]
        # Capitaliser uniquement la première lettre (MOYENNE → Moyenne)
        return priority.capitalize()
    
    def send_email(
        self,
        to_emails: List[str],
        subject: str,
        body: str,
        html_body: Optional[str] = None
    ) -> bool:
        """
        Envoie un email à une ou plusieurs adresses
        
        Args:
            to_emails: Liste des adresses email destinataires
            subject: Sujet de l'email
            body: Corps de l'email en texte brut
            html_body: Corps de l'email en HTML (optionnel)
        
        Returns:
            True si l'email a été envoyé avec succès, False sinon
        """
        if not self.email_enabled:
            print(f"[EMAIL] Envoi désactivé - Email non envoyé à {to_emails}")
            return False
        
        if not to_emails:
            print("[EMAIL] Aucun destinataire spécifié")
            return False
        
        # Filtrer les emails vides
        to_emails = [email for email in to_emails if email and email.strip()]
        if not to_emails:
            print("[EMAIL] Aucun email valide dans la liste")
            return False
        
        try:
            # Créer le message
            msg = MIMEMultipart('alternative')
            msg['From'] = f"{self.sender_name} <{self.sender_email}>"
            msg['To'] = ", ".join(to_emails)
            msg['Subject'] = subject
            
            # Ajouter le corps en texte brut
            text_part = MIMEText(body, 'plain', 'utf-8')
            msg.attach(text_part)
            
            # Ajouter le corps HTML si fourni
            if html_body:
                html_part = MIMEText(html_body, 'html', 'utf-8')
                msg.attach(html_part)
            
            # Connexion au serveur SMTP
            if self.use_tls:
                server = smtplib.SMTP(self.smtp_server, self.smtp_port)
                server.starttls()
            else:
                server = smtplib.SMTP_SSL(self.smtp_server, self.smtp_port)
            
            # Authentification si nécessaire
            if self.smtp_username and self.smtp_password:
                server.login(self.smtp_username, self.smtp_password)
            
            # Envoyer l'email
            server.send_message(msg)
            server.quit()
            
            print(f"[EMAIL] Email envoyé avec succès à {to_emails}")
            return True
            
        except Exception as e:
            print(f"[EMAIL] Erreur lors de l'envoi de l'email: {str(e)}")
            return False
    
    def send_ticket_created_notification(
        self,
        ticket_number: int,
        ticket_title: str,
        creator_name: str,
        recipient_emails: List[str]
    ) -> bool:
        """
        Envoie une notification lorsqu'un nouveau ticket est créé
        
        Args:
            ticket_number: Numéro du ticket
            ticket_title: Titre du ticket
            creator_name: Nom du créateur du ticket
            recipient_emails: Liste des emails destinataires (DSI, Secrétaire, Adjoint)
        
        Returns:
            True si l'email a été envoyé avec succès
        """
        formatted_number = self._format_ticket_number(ticket_number)
        subject = f"Nouveau ticket {formatted_number} créé: {ticket_title}"
        
        body = f"""
Bonjour,

Un nouveau ticket a été créé dans le système de gestion des tickets.

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}
• Créateur : {creator_name}

Veuillez vous connecter à l'application pour analyser et assigner ce ticket.

Cordialement,
{self.sender_name}
"""
        
        html_body = f"""
<html>
<body>
    <h2>Nouveau ticket créé</h2>
    <p>Bonjour,</p>
    <p>Un nouveau ticket a été créé dans le système de gestion des tickets.</p>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
            <li><strong>Créateur :</strong> {creator_name}</li>
        </ul>
    </div>
    <p>Veuillez vous connecter à l'application pour analyser et assigner ce ticket.</p>
    <div style="margin: 20px 0;">
        <a href="{self.app_base_url}/login?redirect=/dashboard" style="background:#007bff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">Ouvrir l'application</a>
    </div>
    <p>Cordialement,<br>{self.sender_name}</p>
</body>
</html>
"""
        
        return self.send_email(recipient_emails, subject, body, html_body)

    def send_ticket_created_notification_with_actions(
        self,
        ticket_id: str,
        ticket_number: int,
        ticket_title: str,
        creator_name: str,
        recipient_email: str,
        recipient_role: str,
        recipient_name: str = ""
    ) -> bool:
        formatted_number = self._format_ticket_number(ticket_number)
        subject = f"Nouveau ticket {formatted_number} créé: {ticket_title}"
        greeting = f"Bonjour, {recipient_name}" if recipient_name else "Bonjour,"
        body = f"""
{greeting}

Un nouveau ticket a été créé dans le système de gestion des tickets.

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}
• Créateur : {creator_name}

Veuillez vous connecter à l'application pour analyser et assigner ce ticket.

Cordialement,
{self.sender_name}
"""
        # Les liens pointent vers /login avec redirection pour forcer l'authentification
        if recipient_role == "DSI":
            # Pour le DSI : plus de boutons d'action, seulement une phrase avec lien vers l'application
            login_params = urlencode({
                "redirect": "/dashboard/dsi"
            })
            login_link = f"{self.app_base_url}/login?{login_params}"
            actions_html = f"""
            <p>Veuillez vous connecter à l'application en cliquant sur ce lien afin d'analyser et d'assigner ce ticket :
                <a href="{login_link}" style="color:#007bff;text-decoration:underline;">Accéder à l'application</a>.
            </p>
            """
        else:
            # Secrétaire DSI, Adjoint DSI et Admin : seulement le bouton "Assigner à un technicien"
            if recipient_role == "Admin":
                role_path = "/dashboard/admin"
            elif recipient_role == "Adjoint DSI":
                role_path = "/dashboard/adjoint"
            else:
                role_path = "/dashboard/secretary"
            
            assign_params = urlencode({
                "redirect": role_path,
                "ticket": ticket_id,
                "action": "assign"
            })
            assign_link = f"{self.app_base_url}/login?{assign_params}"
            
            actions_html = f"""
            <div style="margin: 20px 0;">
                <a href="{assign_link}" style="background:#007bff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">Assigner à un technicien</a>
            </div>
            """
        html_body = f"""
<html>
<body>
    <h2>Nouveau ticket créé</h2>
    <p>{greeting}</p>
    <p>Un nouveau ticket a été créé dans le système de gestion des tickets.</p>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
            <li><strong>Créateur :</strong> {creator_name}</li>
        </ul>
    </div>
    {actions_html}
    <p>Cordialement,<br>{self.sender_name}</p>
</body>
</html>
"""
        return self.send_email([recipient_email], subject, body, html_body)
    
    def send_ticket_assigned_notification(
        self,
        ticket_id: str,
        ticket_number: int,
        ticket_title: str,
        technician_email: str,
        technician_name: str,
        priority: Optional[str] = None,
        notes: Optional[str] = None
    ) -> bool:
        """
        Envoie une notification lorsqu'un ticket est assigné à un technicien
        
        Args:
            ticket_number: Numéro du ticket
            ticket_title: Titre du ticket
            technician_email: Email du technicien
            technician_name: Nom du technicien
            priority: Priorité du ticket (optionnel)
            notes: Notes d'assignation (optionnel)
        
        Returns:
            True si l'email a été envoyé avec succès
        """
        formatted_number = self._format_ticket_number(ticket_number)
        subject = f"Ticket {formatted_number} vous a été assigné: {ticket_title}"
        
        body = f"""
Bonjour {technician_name},

Un nouveau ticket vous a été assigné.

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}
"""
        
        if priority:
            formatted_priority = self._format_priority(priority)
            body += f"• Priorité : {formatted_priority}\n"
        
        if notes:
            body += f"\nInstructions :\n{notes}\n"
        
        body += f"""
Veuillez vous connecter à l'application pour prendre en charge ce ticket.

Cordialement,
{self.sender_name}
"""
        
        # Lien vers login avec redirection pour forcer l'authentification
        redirect_params = urlencode({
            "redirect": "/dashboard/techniciens",
            "ticket": ticket_id
        })
        action_link = f"{self.app_base_url}/login?{redirect_params}"
        
        # Construire le HTML progressivement
        html_body = f"""
<html>
<body>
    <h2>Ticket assigné</h2>
    <p>Bonjour {technician_name},</p>
    <p>Un nouveau ticket vous a été assigné.</p>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
"""
        
        if priority:
            formatted_priority = self._format_priority(priority)
            html_body += f"            <li><strong>Priorité :</strong> {formatted_priority}</li>\n"
        
        html_body += "        </ul>"
        
        if notes:
            html_body += f"""
        <p><strong>Instructions :</strong></p>
        <p style="background-color: #fff; padding: 10px; border-left: 3px solid #007bff;">{notes}</p>
"""
        
        html_body += f"""
    </div>
    <p>
        Veuillez vous connecter à l'application en cliquant sur ce lien afin de prendre en charge et de résoudre ce ticket :
        <a href="{action_link}" style="color:#007bff;text-decoration:underline;">Accéder à l'application</a>.
    </p>
    <p>Cordialement,<br>{self.sender_name}</p>
</body>
</html>
"""
        
        return self.send_email([technician_email], subject, body, html_body)
    
    def send_ticket_assigned_to_creator_notification(
        self,
        ticket_id: str,
        ticket_number: int,
        ticket_title: str,
        creator_email: str,
        creator_name: str,
        technician_name: str
    ) -> bool:
        """
        Envoie une notification au créateur du ticket lorsqu'il est assigné à un technicien
        
        Args:
            ticket_id: ID du ticket
            ticket_number: Numéro du ticket
            ticket_title: Titre du ticket
            creator_email: Email du créateur
            creator_name: Nom du créateur
            technician_name: Nom du technicien assigné
        
        Returns:
            True si l'email a été envoyé avec succès
        """
        formatted_number = self._format_ticket_number(ticket_number)
        subject = f"Votre ticket {formatted_number} a été assigné à un technicien"
        
        body = f"""
Bonjour {creator_name},

Votre ticket a été assigné à un technicien et sera traité prochainement.

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}
• Technicien assigné : {technician_name}

Vous serez notifié lorsque le ticket sera résolu.

Cordialement,
{self.sender_name}
"""
        
        # Lien vers login avec redirection pour forcer l'authentification
        redirect_params = urlencode({
            "redirect": "/dashboard/user",
            "ticket": ticket_id
        })
        action_link = f"{self.app_base_url}/login?{redirect_params}"
        html_body = f"""
<html>
<body>
    <h2>Ticket assigné</h2>
    <p>Bonjour {creator_name},</p>
    <p>Votre ticket a été assigné à un technicien et sera traité prochainement.</p>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
            <li><strong>Technicien assigné :</strong> {technician_name}</li>
        </ul>
    </div>
    <p>Vous serez notifié lorsque le ticket sera résolu.</p>
    <p>
        Pour suivre l'avancement de votre demande, veuillez vous connecter à l'application en cliquant sur ce lien :
        <a href="{action_link}" style="color:#007bff;text-decoration:underline;">Accéder à l'application</a>.
    </p>
    <p>Cordialement,<br>{self.sender_name}</p>
</body>
</html>
"""
        
        return self.send_email([creator_email], subject, body, html_body)
    
    def send_ticket_created_to_creator_notification(
        self,
        ticket_id: str,
        ticket_number: int,
        ticket_title: str,
        creator_email: str,
        creator_name: str
    ) -> bool:
        """
        Envoie une notification au créateur lorsqu'il crée un ticket
        
        Args:
            ticket_id: ID du ticket
            ticket_number: Numéro du ticket
            ticket_title: Titre du ticket
            creator_email: Email du créateur
            creator_name: Nom du créateur
        
        Returns:
            True si l'email a été envoyé avec succès
        """
        formatted_number = self._format_ticket_number(ticket_number)
        subject = f"Votre ticket {formatted_number} a été créé avec succès"
        
        body = f"""
Bonjour {creator_name},

Votre ticket a été créé avec succès et sera traité prochainement.

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}

Vous serez notifié lorsque le ticket sera assigné à un technicien.

Cordialement,
{self.sender_name}
"""
        
        # Lien vers login avec redirection pour forcer l'authentification
        redirect_params = urlencode({
            "redirect": "/dashboard/user",
            "ticket": ticket_id
        })
        action_link = f"{self.app_base_url}/login?{redirect_params}"
        html_body = f"""
<html>
<body>
    <h2>Ticket créé</h2>
    <p>Bonjour {creator_name},</p>
    <p>Votre ticket a été créé avec succès et sera traité prochainement.</p>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
        </ul>
    </div>
    <p>Vous serez notifié lorsque le ticket sera assigné à un technicien.</p>
    <p>
        Pour consulter le détail de votre demande et suivre son traitement, veuillez vous connecter à l'application en cliquant sur ce lien :
        <a href="{action_link}" style="color:#007bff;text-decoration:underline;">Accéder à l'application</a>.
    </p>
    <p>Cordialement,<br>{self.sender_name}</p>
</body>
</html>
"""
        
        return self.send_email([creator_email], subject, body, html_body)
    
    def send_ticket_rejected_notification(
        self,
        ticket_number: int,
        ticket_title: str,
        technician_email: str,
        technician_name: str,
        rejection_reason: Optional[str] = None
    ) -> bool:
        formatted_number = self._format_ticket_number(ticket_number)
        subject = f"Ticket {formatted_number} rejeté par l'utilisateur: {ticket_title}"
        body = f"""
Bonjour {technician_name},

L'utilisateur a rejeté la résolution du ticket.

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}
"""
        if rejection_reason:
            body += f"• Motif du rejet : {rejection_reason}\n"

        body += f"""
Veuillez vous connecter à l'application et reprendre le ticket si nécessaire.

Cordialement,
{self.sender_name}
"""

        html_body = f"""
<html>
<body>
    <h2>Ticket rejeté</h2>
    <p>Bonjour {technician_name},</p>
    <p>L'utilisateur a rejeté la résolution du ticket.</p>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
        </ul>
    </div>
    {('<p><strong>Motif du rejet :</strong> ' + rejection_reason + '</p>') if rejection_reason else ''}
    <p>Veuillez vous connecter à l'application et reprendre le ticket si nécessaire.</p>
    <p>Cordialement,<br>{self.sender_name}</p>
    </body>
</html>
"""

        return self.send_email([technician_email], subject, body, html_body)
    
    def send_ticket_delegated_to_adjoint_notification(
        self,
        ticket_id: str,
        ticket_number: int,
        ticket_title: str,
        adjoint_email: str,
        adjoint_name: str,
        dsi_name: str,
        notes: Optional[str] = None
    ) -> bool:
        """
        Envoie une notification par email à l'adjoint DSI lorsqu'un ticket lui est délégué par le DSI
        
        Args:
            ticket_id: ID du ticket
            ticket_number: Numéro du ticket
            ticket_title: Titre du ticket
            adjoint_email: Email de l'adjoint DSI
            adjoint_name: Nom de l'adjoint DSI
            dsi_name: Nom du DSI qui délègue
            notes: Notes de délégation (optionnel)
        
        Returns:
            True si l'email a été envoyé avec succès
        """
        formatted_number = self._format_ticket_number(ticket_number)
        subject = f"Ticket {formatted_number} délégué par le DSI: {ticket_title}"
        
        body = f"""
Bonjour {adjoint_name},

Le DSI {dsi_name} vous a délégué un ticket à assigner à un technicien.

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}
"""
        
        if notes:
            body += f"\nNotes du DSI :\n{notes}\n"
        
        body += f"""
Veuillez vous connecter à l'application pour assigner ce ticket à un technicien.

Cordialement,
{self.sender_name}
"""
        
        # Lien vers le dashboard avec le ticket et l'action assign
        redirect_params = urlencode({
            "redirect": "/dashboard/adjoint",
            "ticket": ticket_id,
            "action": "assign"
        })
        action_link = f"{self.app_base_url}/login?{redirect_params}"
        
        html_body = f"""
<html>
<body>
    <h2>Ticket délégué par le DSI</h2>
    <p>Bonjour {adjoint_name},</p>
    <p>Le DSI <strong>{dsi_name}</strong> vous a délégué un ticket à assigner à un technicien.</p>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
        </ul>
    </div>
"""
        
        if notes:
            html_body += f"""
    <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 3px solid #ffc107;">
        <p><strong>Notes du DSI :</strong></p>
        <p>{notes}</p>
    </div>
"""
        
        html_body += f"""
    <div style="margin: 20px 0;">
        <a href="{action_link}" style="background:#0ea5e9;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block;font-weight:bold">Assigner ce ticket</a>
    </div>
    <p>Veuillez vous connecter à l'application pour assigner ce ticket à un technicien.</p>
    <p>Cordialement,<br>{self.sender_name}</p>
</body>
</html>
"""
        
        return self.send_email([adjoint_email], subject, body, html_body)
    
    def send_ticket_in_progress_notification(
        self,
        ticket_id: str,
        ticket_number: int,
        ticket_title: str,
        creator_email: str,
        creator_name: str,
        technician_name: str
    ) -> bool:
        """Envoie une notification à l'utilisateur lorsque le ticket est en cours de traitement"""
        formatted_number = self._format_ticket_number(ticket_number)
        subject = f"Votre ticket {formatted_number} est en cours de traitement"
        
        body = f"""
Bonjour {creator_name},

Votre ticket est maintenant en cours de traitement par le technicien.

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}
• Technicien : {technician_name}

Vous serez notifié lorsque le ticket sera résolu.

Cordialement,
{self.sender_name}
"""
        
        redirect_params = urlencode({
            "redirect": "/dashboard/user",
            "ticket": ticket_id
        })
        action_link = f"{self.app_base_url}/login?{redirect_params}"
        html_body = f"""
<html>
<body>
    <h2>Ticket en cours de traitement</h2>
    <p>Bonjour {creator_name},</p>
    <p>Votre ticket est maintenant en cours de traitement par le technicien.</p>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
            <li><strong>Technicien :</strong> {technician_name}</li>
        </ul>
    </div>
    <p>Vous serez notifié lorsque le ticket sera résolu.</p>
    <p>
        Pour suivre l'avancement de votre demande, veuillez vous connecter à l'application en cliquant sur ce lien :
        <a href="{action_link}" style="color:#007bff;text-decoration:underline;">Accéder à l'application</a>.
    </p>
    <p>Cordialement,<br>{self.sender_name}</p>
</body>
</html>
"""
        
        return self.send_email([creator_email], subject, body, html_body)
    
    def send_ticket_resolved_notification(
        self,
        ticket_id: str,
        ticket_number: int,
        ticket_title: str,
        creator_email: str,
        creator_name: str,
        resolution_summary: Optional[str] = None
    ) -> bool:
        """Envoie une notification à l'utilisateur lorsque le ticket est résolu"""
        formatted_number = self._format_ticket_number(ticket_number)
        subject = f"Votre ticket {formatted_number} a été résolu - Validation requise"
        
        body = f"""
Bonjour {creator_name},

Votre ticket a été résolu. Veuillez valider la résolution.

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}
"""
        if resolution_summary:
            body += f"• Résumé de la résolution : {resolution_summary}\n"
        
        body += f"""
Merci de valider la résolution dans les 14 jours. Si vous ne validez pas, le ticket sera clôturé automatiquement.

Cordialement,
{self.sender_name}
"""
        
        redirect_params = urlencode({
            "redirect": "/dashboard/user",
            "ticket": ticket_id
        })
        action_link = f"{self.app_base_url}/login?{redirect_params}"
        html_body = f"""
<html>
<body>
    <h2>Ticket résolu - Validation requise</h2>
    <p>Bonjour {creator_name},</p>
    <p>Votre ticket a été résolu. Veuillez valider la résolution.</p>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
        </ul>
    </div>
"""
        if resolution_summary:
            html_body += f"""
    <div style="background-color: #d1ecf1; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Résumé de la résolution :</strong></p>
        <p>{resolution_summary}</p>
    </div>
"""
        html_body += f"""
    <p style="color: #856404; background-color: #fff3cd; padding: 10px; border-radius: 5px;">
        <strong>⚠️ Important :</strong> Merci de valider la résolution dans les 14 jours. Si vous ne validez pas, le ticket sera clôturé automatiquement.
    </p>
    <div style="margin: 20px 0;">
        <a href="{action_link}" style="background:#28a745;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block;font-weight:bold">Valider la résolution</a>
    </div>
    <p>Cordialement,<br>{self.sender_name}</p>
</body>
</html>
"""
        
        return self.send_email([creator_email], subject, body, html_body)
    
    def send_validation_reminder(
        self,
        ticket_id: str,
        ticket_number: int,
        ticket_title: str,
        creator_email: str,
        creator_name: str,
        reminder_number: int,
        days_since_resolution: int
    ) -> bool:
        """Envoie un rappel de validation à l'utilisateur"""
        formatted_number = self._format_ticket_number(ticket_number)
        subjects = {
            1: f"Rappel : Veuillez valider votre ticket {formatted_number}",
            2: f"Second rappel : Validation requise pour votre ticket {formatted_number}",
            3: f"Dernier rappel : Veuillez valider votre ticket {formatted_number}"
        }
        subject = subjects.get(reminder_number, f"Rappel : Validation requise pour votre ticket {formatted_number}")
        
        messages = {
            1: f"Votre ticket a été résolu il y a {days_since_resolution} jours. Veuillez valider la résolution.",
            2: f"Votre ticket a été résolu il y a {days_since_resolution} jours. Validation requise.",
            3: f"⚠️ Dernier rappel : Votre ticket a été résolu il y a {days_since_resolution} jours. Si vous ne validez pas dans les prochains jours, le ticket sera clôturé automatiquement."
        }
        message = messages.get(reminder_number, f"Votre ticket a été résolu il y a {days_since_resolution} jours.")
        
        body = f"""
Bonjour {creator_name},

{message}

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}

Merci de valider la résolution dès que possible.

Cordialement,
{self.sender_name}
"""
        
        redirect_params = urlencode({
            "redirect": "/dashboard/user",
            "ticket": ticket_id
        })
        action_link = f"{self.app_base_url}/login?{redirect_params}"
        
        urgency_style = "background-color: #f8d7da; border-left: 4px solid #dc3545;" if reminder_number == 3 else "background-color: #fff3cd; border-left: 4px solid #ffc107;"
        
        html_body = f"""
<html>
<body>
    <h2>Rappel de validation</h2>
    <p>Bonjour {creator_name},</p>
    <div style="{urgency_style} padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>{message}</strong></p>
    </div>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
        </ul>
    </div>
    <div style="margin: 20px 0;">
        <a href="{action_link}" style="background:#28a745;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block;font-weight:bold">Valider la résolution</a>
    </div>
    <p>Cordialement,<br>{self.sender_name}</p>
</body>
</html>
"""
        
        return self.send_email([creator_email], subject, body, html_body)
    
    def send_ticket_auto_closed_notification(
        self,
        ticket_id: str,
        ticket_number: int,
        ticket_title: str,
        creator_email: str,
        creator_name: str
    ) -> bool:
        """Envoie une notification à l'utilisateur lorsque le ticket est clôturé automatiquement"""
        formatted_number = self._format_ticket_number(ticket_number)
        subject = f"Votre ticket {formatted_number} a été clôturé automatiquement"
        
        body = f"""
Bonjour {creator_name},

Votre ticket a été clôturé automatiquement après 14 jours sans validation.

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}

Vous pouvez réouvrir ce ticket dans les 7 prochains jours si le problème persiste. Après cette période, vous devrez créer un nouveau ticket.

Cordialement,
{self.sender_name}
"""
        
        redirect_params = urlencode({
            "redirect": "/dashboard/user",
            "ticket": ticket_id
        })
        action_link = f"{self.app_base_url}/login?{redirect_params}"
        html_body = f"""
<html>
<body>
    <h2>Ticket clôturé automatiquement</h2>
    <p>Bonjour {creator_name},</p>
    <div style="background-color: #f8d7da; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #dc3545;">
        <p><strong>Votre ticket a été clôturé automatiquement après 14 jours sans validation.</strong></p>
    </div>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
        </ul>
    </div>
    <div style="background-color: #d1ecf1; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>⚠️ Important :</strong> Vous pouvez réouvrir ce ticket dans les <strong>7 prochains jours</strong> si le problème persiste. Après cette période, vous devrez créer un nouveau ticket.</p>
    </div>
    <div style="margin: 20px 0;">
        <a href="{action_link}" style="background:#007bff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">Voir le ticket</a>
    </div>
    <p>Cordialement,<br>{self.sender_name}</p>
</body>
</html>
"""
        
        return self.send_email([creator_email], subject, body, html_body)
    
    def send_ticket_rejected_notification_to_user(
        self,
        ticket_id: str,
        ticket_number: int,
        ticket_title: str,
        creator_email: str,
        creator_name: str,
        rejection_reason: Optional[str] = None
    ) -> bool:
        """Envoie une notification à l'utilisateur lorsque son ticket est rejeté"""
        formatted_number = self._format_ticket_number(ticket_number)
        subject = f"Votre ticket {formatted_number} a été rejeté"
        
        body = f"""
Bonjour {creator_name},

Votre ticket a été rejeté.

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}
"""
        if rejection_reason:
            body += f"• Raison du rejet : {rejection_reason}\n"
        
        body += f"""
Si vous avez des questions, n'hésitez pas à contacter le support.

Cordialement,
{self.sender_name}
"""
        
        redirect_params = urlencode({
            "redirect": "/dashboard/user",
            "ticket": ticket_id
        })
        action_link = f"{self.app_base_url}/login?{redirect_params}"
        html_body = f"""
<html>
<body>
    <h2>Ticket rejeté</h2>
    <p>Bonjour {creator_name},</p>
    <div style="background-color: #f8d7da; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #dc3545;">
        <p><strong>Votre ticket a été rejeté.</strong></p>
    </div>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
        </ul>
    </div>
"""
        if rejection_reason:
            html_body += f"""
    <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Raison du rejet :</strong></p>
        <p>{rejection_reason}</p>
    </div>
"""
        html_body += f"""
    <p>Si vous avez des questions, n'hésitez pas à contacter le support.</p>
    <div style="margin: 20px 0;">
        <a href="{action_link}" style="background:#007bff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">Voir le ticket</a>
    </div>
    <p>Cordialement,<br>{self.sender_name}</p>
</body>
</html>
"""
        
        return self.send_email([creator_email], subject, body, html_body)
    
    def send_comment_notification_to_user(
        self,
        ticket_id: str,
        ticket_number: int,
        ticket_title: str,
        creator_email: str,
        creator_name: str,
        commenter_name: str,
        comment_content: str
    ) -> bool:
        """Envoie une notification à l'utilisateur lorsqu'un commentaire est ajouté"""
        formatted_number = self._format_ticket_number(ticket_number)
        subject = f"Nouveau commentaire sur votre ticket {formatted_number}"
        
        body = f"""
Bonjour {creator_name},

Un nouveau commentaire a été ajouté sur votre ticket.

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}
• Commentaire de : {commenter_name}

Commentaire :
{comment_content}

Cordialement,
{self.sender_name}
"""
        
        redirect_params = urlencode({
            "redirect": "/dashboard/user",
            "ticket": ticket_id
        })
        action_link = f"{self.app_base_url}/login?{redirect_params}"
        html_body = f"""
<html>
<body>
    <h2>Nouveau commentaire</h2>
    <p>Bonjour {creator_name},</p>
    <p>Un nouveau commentaire a été ajouté sur votre ticket.</p>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
            <li><strong>Commentaire de :</strong> {commenter_name}</li>
        </ul>
    </div>
    <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #007bff;">
        <p><strong>Commentaire :</strong></p>
        <p>{comment_content}</p>
    </div>
    <div style="margin: 20px 0;">
        <a href="{action_link}" style="background:#007bff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">Voir le ticket</a>
    </div>
    <p>Cordialement,<br>{self.sender_name}</p>
</body>
</html>
"""
        
        return self.send_email([creator_email], subject, body, html_body)
    
    def send_priority_changed_notification(
        self,
        ticket_id: str,
        ticket_number: int,
        ticket_title: str,
        creator_email: str,
        creator_name: str,
        old_priority: str,
        new_priority: str
    ) -> bool:
        """Envoie une notification à l'utilisateur lorsque la priorité change"""
        formatted_number = self._format_ticket_number(ticket_number)
        formatted_old_priority = self._format_priority(old_priority)
        formatted_new_priority = self._format_priority(new_priority)
        subject = f"Priorité modifiée pour votre ticket {formatted_number}"
        
        body = f"""
Bonjour {creator_name},

La priorité de votre ticket a été modifiée.

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}
• Ancienne priorité : {formatted_old_priority}
• Nouvelle priorité : {formatted_new_priority}

Cordialement,
{self.sender_name}
"""
        
        redirect_params = urlencode({
            "redirect": "/dashboard/user",
            "ticket": ticket_id
        })
        action_link = f"{self.app_base_url}/login?{redirect_params}"
        html_body = f"""
<html>
<body>
    <h2>Priorité modifiée</h2>
    <p>Bonjour {creator_name},</p>
    <p>La priorité de votre ticket a été modifiée.</p>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
            <li><strong>Ancienne priorité :</strong> {formatted_old_priority}</li>
            <li><strong>Nouvelle priorité :</strong> <strong style="color: #dc3545;">{formatted_new_priority}</strong></li>
        </ul>
    </div>
    <div style="margin: 20px 0;">
        <a href="{action_link}" style="background:#007bff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">Voir le ticket</a>
    </div>
    <p>Cordialement,<br>{self.sender_name}</p>
</body>
</html>
"""
        
        return self.send_email([creator_email], subject, body, html_body)
    
    def send_technician_changed_notification(
        self,
        ticket_id: str,
        ticket_number: int,
        ticket_title: str,
        creator_email: str,
        creator_name: str,
        old_technician_name: Optional[str],
        new_technician_name: str
    ) -> bool:
        """Envoie une notification à l'utilisateur lorsque le technicien change"""
        formatted_number = self._format_ticket_number(ticket_number)
        subject = f"Technicien modifié pour votre ticket {formatted_number}"
        
        technician_info = f"• Nouveau technicien : {new_technician_name}"
        if old_technician_name:
            technician_info = f"• Ancien technicien : {old_technician_name}\n{technician_info}"
        
        body = f"""
Bonjour {creator_name},

Votre ticket a été réassigné à un autre technicien.

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}
{technician_info}

Cordialement,
{self.sender_name}
"""
        
        redirect_params = urlencode({
            "redirect": "/dashboard/user",
            "ticket": ticket_id
        })
        action_link = f"{self.app_base_url}/login?{redirect_params}"
        html_body = f"""
<html>
<body>
    <h2>Technicien modifié</h2>
    <p>Bonjour {creator_name},</p>
    <p>Votre ticket a été réassigné à un autre technicien.</p>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
"""
        if old_technician_name:
            html_body += f"            <li><strong>Ancien technicien :</strong> {old_technician_name}</li>\n"
        html_body += f"""            <li><strong>Nouveau technicien :</strong> {new_technician_name}</li>
        </ul>
    </div>
    <div style="margin: 20px 0;">
        <a href="{action_link}" style="background:#007bff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">Voir le ticket</a>
    </div>
    <p>Cordialement,<br>{self.sender_name}</p>
</body>
</html>
"""
        
        return self.send_email([creator_email], subject, body, html_body)
    
    def send_ticket_reopened_notification(
        self,
        ticket_id: str,
        ticket_number: int,
        ticket_title: str,
        creator_email: str,
        creator_name: str
    ) -> bool:
        """Envoie une notification à l'utilisateur lorsque le ticket est réouvert"""
        formatted_number = self._format_ticket_number(ticket_number)
        subject = f"Votre ticket {formatted_number} a été réouvert"
        
        body = f"""
Bonjour {creator_name},

Votre ticket a été réouvert pour traitement supplémentaire.

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}

Le ticket sera traité à nouveau par un technicien.

Cordialement,
{self.sender_name}
"""
        
        redirect_params = urlencode({
            "redirect": "/dashboard/user",
            "ticket": ticket_id
        })
        action_link = f"{self.app_base_url}/login?{redirect_params}"
        html_body = f"""
<html>
<body>
    <h2>Ticket réouvert</h2>
    <p>Bonjour {creator_name},</p>
    <div style="background-color: #d1ecf1; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #0dcaf0;">
        <p><strong>Votre ticket a été réouvert pour traitement supplémentaire.</strong></p>
    </div>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
        </ul>
    </div>
    <p>Le ticket sera traité à nouveau par un technicien.</p>
    <div style="margin: 20px 0;">
        <a href="{action_link}" style="background:#007bff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">Voir le ticket</a>
    </div>
    <p>Cordialement,<br>{self.sender_name}</p>
</body>
</html>
"""
        
        return self.send_email([creator_email], subject, body, html_body)
    
    def send_ticket_closed_notification_to_user(
        self,
        ticket_id: str,
        ticket_number: int,
        ticket_title: str,
        creator_email: str,
        creator_name: str
    ) -> bool:
        """Envoie une notification à l'utilisateur lorsque le ticket est clôturé (après validation)"""
        formatted_number = self._format_ticket_number(ticket_number)
        subject = f"Votre ticket {formatted_number} a été clôturé"
        
        body = f"""
Bonjour {creator_name},

Votre ticket a été clôturé avec succès.

Détails du ticket :
• Numéro : {formatted_number}
• Titre : {ticket_title}

Merci d'avoir utilisé notre service de support.

Cordialement,
{self.sender_name}
"""
        
        redirect_params = urlencode({
            "redirect": "/dashboard/user",
            "ticket": ticket_id
        })
        action_link = f"{self.app_base_url}/login?{redirect_params}"
        html_body = f"""
<html>
<body>
    <h2>Ticket clôturé</h2>
    <p>Bonjour {creator_name},</p>
    <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #28a745;">
        <p><strong>Votre ticket a été clôturé avec succès.</strong></p>
    </div>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Détails du ticket :</strong></p>
        <ul>
            <li><strong>Numéro :</strong> {formatted_number}</li>
            <li><strong>Titre :</strong> {ticket_title}</li>
        </ul>
    </div>
    <p>Merci d'avoir utilisé notre service de support.</p>
    <div style="margin: 20px 0;">
        <a href="{action_link}" style="background:#007bff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">Voir le ticket</a>
    </div>
    <p>Cordialement,<br>{self.sender_name}</p>
</body>
</html>
"""
        
        return self.send_email([creator_email], subject, body, html_body)


# Instance globale du service email
email_service = EmailService()

