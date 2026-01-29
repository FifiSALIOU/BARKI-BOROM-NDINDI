from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from .models import TicketPriority, TicketStatus, TicketType, CommentType, NotificationType, TicketTypeModel, TicketCategory


class RoleBase(BaseModel):
    name: str
    description: Optional[str] = None


class RoleRead(RoleBase):
    id: int
    permissions: Optional[List[str]] = None

    class Config:
        from_attributes = True


class UserBase(BaseModel):
    full_name: str
    email: str  # Changed from EmailStr to str to avoid email-validator dependency issue
    agency: Optional[str] = None  # Agence au lieu de département
    phone: Optional[str] = None
    specialization: Optional[str] = None  # Spécialisation : "materiel" ou "applicatif"
    max_tickets_capacity: Optional[int] = None  # Capacité max de tickets simultanés
    notes: Optional[str] = None  # Notes optionnelles


class UserCreate(UserBase):
    username: str
    password: str
    role_id: int
    send_credentials_email: Optional[bool] = False


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    agency: Optional[str] = None
    phone: Optional[str] = None
    role_id: Optional[int] = None
    actif: Optional[bool] = None
    specialization: Optional[str] = None
    max_tickets_capacity: Optional[int] = None
    notes: Optional[str] = None


class UserRead(UserBase):
    id: int
    role: RoleRead
    actif: bool

    class Config:
        from_attributes = True


class PasswordReset(BaseModel):
    new_password: Optional[str] = None  # Si None, génère un mot de passe aléatoire


class TicketBase(BaseModel):
    title: str
    description: str
    type: TicketType
    priority: TicketPriority
    category: Optional[str] = None  # Catégorie du ticket (ex: Réseau, Logiciel, Matériel, etc.)


class TicketCreate(TicketBase):
    pass


class TicketEdit(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[TicketType] = None
    priority: Optional[TicketPriority] = None
    category: Optional[str] = None


class TicketUpdate(BaseModel):
    status: Optional[TicketStatus] = None
    priority: Optional[TicketPriority] = None
    technician_id: Optional[int] = None
    resolution_summary: Optional[str] = None  # Résumé de la résolution


class TicketAssign(BaseModel):
    technician_id: int
    reason: Optional[str] = None
    notes: Optional[str] = None  # Notes/instructions pour le technicien

class TicketDelegate(BaseModel):
    adjoint_id: int
    reason: Optional[str] = None
    notes: Optional[str] = None


class TicketRead(TicketBase):
    id: int
    number: int
    status: TicketStatus
    created_at: datetime
    creator_id: int
    creator: Optional[UserRead] = None  # Informations complètes du créateur
    technician_id: Optional[int] = None
    technician: Optional[UserRead] = None  # Informations complètes du technicien
    secretary_id: Optional[int] = None
    user_agency: Optional[str] = None  # Agence de l'utilisateur créateur
    assigned_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    # category est hérité de TicketBase

    class Config:
        from_attributes = True


class TicketTypeConfig(BaseModel):
    id: int
    code: str
    label: str
    is_active: bool

    class Config:
        from_attributes = True


class TicketTypeUpdate(BaseModel):
    label: Optional[str] = None
    is_active: Optional[bool] = None


class TicketTypeCreate(BaseModel):
    label: str
    is_active: bool = True


class TicketCategoryConfig(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    type_code: str  # Récupéré depuis ticket_type.code via la relation dans l'endpoint API
    is_active: bool

    class Config:
        from_attributes = True


class TicketCategoryUpdate(BaseModel):
    name: Optional[str] = None
    ticket_type_id: Optional[int] = None
    is_active: Optional[bool] = None


class TicketCategoryCreate(BaseModel):
    name: str
    ticket_type_id: int
    description: Optional[str] = None
    is_active: bool = True


class CommentCreate(BaseModel):
    content: str
    type: CommentType = CommentType.TECHNIQUE
    ticket_id: int


class CommentRead(BaseModel):
    id: int
    ticket_id: int
    user_id: int
    content: str
    type: CommentType
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[int] = None


class TicketValidation(BaseModel):
    """Schéma pour la validation utilisateur d'un ticket résolu"""
    validated: bool  # True = valide (clôture), False = rejette (rejete)
    rejection_reason: Optional[str] = None  # Motif de rejet (obligatoire si validated=False)


class TicketFeedback(BaseModel):
    """Schéma pour le feedback/satisfaction utilisateur"""
    score: int  # 1-5
    comment: Optional[str] = None


class NotificationCreate(BaseModel):
    """Schéma pour créer une notification"""
    user_id: int
    type: NotificationType
    ticket_id: Optional[int] = None
    message: str


class NotificationRead(BaseModel):
    """Schéma pour lire une notification"""
    id: int
    user_id: int
    type: NotificationType
    ticket_id: Optional[int] = None
    message: str
    read: bool
    created_at: datetime
    read_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TicketHistoryRead(BaseModel):
    """Schéma pour lire l'historique d'un ticket"""
    id: int
    ticket_id: int
    old_status: Optional[str] = None
    new_status: str
    user_id: int
    reason: Optional[str] = None
    changed_at: datetime
    user: Optional[UserRead] = None

    class Config:
        from_attributes = True
