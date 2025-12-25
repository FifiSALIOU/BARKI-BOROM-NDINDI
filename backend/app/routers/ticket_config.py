from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

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
    Seuls les types actifs sont renvoyés.
    """
    types = (
        db.query(models.TicketTypeModel)
        .filter(models.TicketTypeModel.is_active.is_(True))
        .order_by(models.TicketTypeModel.label.asc())
        .all()
    )
    return types


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
    query = db.query(models.TicketCategory).filter(models.TicketCategory.is_active.is_(True))

    if type_code:
        query = query.filter(models.TicketCategory.type_code == type_code)

    categories = query.order_by(models.TicketCategory.name.asc()).all()
    return categories



