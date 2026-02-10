from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_role


router = APIRouter()


def _ensure_can_view_assets(current_user: models.User) -> None:
    """Vérifie que l'utilisateur a le droit de consulter les actifs."""
    allowed_roles = {
        "Secrétaire DSI",
        "Adjoint DSI",
        "DSI",
        "Admin",
        "Technicien",
    }
    if not current_user.role or current_user.role.name not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )


@router.get(
    "/assets/",
    response_model=List[schemas.AssetRead],
    summary="Lister les actifs",
)
def list_assets(
    search: Optional[str] = Query(
        None,
        description="Recherche par nom, n° de série, marque ou modèle",
    ),
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        description="Filtre sur le statut (in_service, en_maintenance, en_panne, en_stock, reformes)",
    ),
    type_filter: Optional[str] = Query(
        None,
        alias="type",
        description="Filtre sur le type d'actif (desktop, laptop, printer, etc.)",
    ),
    department_filter: Optional[str] = Query(
        None,
        alias="department",
        description="Filtre sur le département/localisation logique",
    ),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> List[schemas.AssetRead]:
    """
    Retourne la liste des actifs.

    Cette route ne modifie aucune donnée existante et se contente d'interroger la table `assets`
    créée par la migration `migrate_create_assets_tables.py`.
    """

    _ensure_can_view_assets(current_user)

    conditions = []
    params: dict = {}

    if search:
        conditions.append(
            "(LOWER(nom) LIKE :search "
            "OR LOWER(numero_de_serie) LIKE :search "
            "OR LOWER(marque) LIKE :search "
            "OR LOWER(modele) LIKE :search)"
        )
        params["search"] = f"%{search.lower()}%"

    if status_filter and status_filter != "all":
        conditions.append("statut = :statut")
        params["statut"] = status_filter

    if type_filter and type_filter != "all":
        conditions.append("type = :type")
        params["type"] = type_filter

    if department_filter and department_filter != "all":
        conditions.append("departement = :departement")
        params["departement"] = department_filter

    where_clause = ""
    if conditions:
        where_clause = " WHERE " + " AND ".join(conditions)

    query = text(
        """
        SELECT
            id,
            nom,
            type,
            numero_de_serie,
            marque,
            modele,
            statut,
            localisation,
            departement,
            date_d_achat,
            date_de_fin_garantie,
            prix_d_achat,
            fournisseur,
            assigned_to_user_id,
            assigned_to_name,
            specifications,
            notes,
            qr_code,
            created_at,
            updated_at,
            created_by
        FROM assets
        """
        + where_clause
        + """
        ORDER BY created_at DESC
        """
    )

    result = db.execute(query, params).mappings().all()
    return [schemas.AssetRead(**row) for row in result]


@router.post(
    "/assets/",
    response_model=schemas.AssetRead,
    status_code=status.HTTP_201_CREATED,
    summary="Créer un nouvel actif",
)
def create_asset(
    asset_in: schemas.AssetCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_role("Adjoint DSI", "DSI", "Admin")
    ),
) -> schemas.AssetRead:
    """
    Crée un nouvel actif dans la table `assets`.

    - Ne supprime ni ne modifie aucun actif existant.
    - Renseigne automatiquement la colonne `created_by` avec l'utilisateur connecté.
    """

    insert_query = text(
        """
        INSERT INTO assets (
            nom,
            type,
            numero_de_serie,
            marque,
            modele,
            statut,
            localisation,
            departement,
            date_d_achat,
            date_de_fin_garantie,
            prix_d_achat,
            fournisseur,
            assigned_to_user_id,
            assigned_to_name,
            specifications,
            notes,
            qr_code,
            created_by
        )
        VALUES (
            :nom,
            :type,
            :numero_de_serie,
            :marque,
            :modele,
            :statut,
            :localisation,
            :departement,
            :date_d_achat,
            :date_de_fin_garantie,
            :prix_d_achat,
            :fournisseur,
            :assigned_to_user_id,
            :assigned_to_name,
            :specifications,
            :notes,
            :qr_code,
            :created_by
        )
        RETURNING
            id,
            nom,
            type,
            numero_de_serie,
            marque,
            modele,
            statut,
            localisation,
            departement,
            date_d_achat,
            date_de_fin_garantie,
            prix_d_achat,
            fournisseur,
            assigned_to_user_id,
            assigned_to_name,
            specifications,
            notes,
            qr_code,
            created_at,
            updated_at,
            created_by
        """
    )

    params = {
        "nom": asset_in.nom.strip(),
        "type": asset_in.type.strip(),
        "numero_de_serie": asset_in.numero_de_serie.strip(),
        "marque": asset_in.marque.strip(),
        "modele": asset_in.modele.strip(),
        "statut": asset_in.statut.strip() if asset_in.statut else "in_stock",
        "localisation": asset_in.localisation.strip(),
        "departement": asset_in.departement.strip(),
        "date_d_achat": asset_in.date_d_achat,
        "date_de_fin_garantie": asset_in.date_de_fin_garantie,
        "prix_d_achat": asset_in.prix_d_achat,
        "fournisseur": asset_in.fournisseur.strip() if asset_in.fournisseur else None,
        "assigned_to_user_id": asset_in.assigned_to_user_id,
        "assigned_to_name": asset_in.assigned_to_name,
        "specifications": asset_in.specifications,
        "notes": asset_in.notes,
        "qr_code": None,  # Génération de QR code éventuelle dans une évolution ultérieure
        "created_by": current_user.id,
    }

    try:
        row = db.execute(insert_query, params).mappings().first()
        db.commit()
    except Exception as exc:  # pragma: no cover - logging simple
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la création de l'actif: {exc}",
        ) from exc

    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la création de l'actif",
        )

    return schemas.AssetRead(**row)


@router.get(
    "/asset-types",
    response_model=List[schemas.AssetTypeConfig],
    summary="Lister les types d'actifs (configuration)",
)
def list_asset_types(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> List[schemas.AssetTypeConfig]:
    """
    Retourne la liste des types d'actifs actifs.

    - Lecture seule.
    - N'altère aucune donnée existante.
    """

    _ensure_can_view_assets(current_user)

    query = text(
        """
        SELECT id, code, label, is_active
        FROM asset_types
        WHERE is_active = TRUE
        ORDER BY label ASC
        """
    )

    result = db.execute(query).mappings().all()
    return [schemas.AssetTypeConfig(**row) for row in result]


@router.put(
    "/assets/{asset_id}",
    response_model=schemas.AssetRead,
    summary="Mettre à jour un actif",
)
def update_asset(
    asset_id: int,
    asset_in: schemas.AssetCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_role("Adjoint DSI", "DSI", "Admin")
    ),
) -> schemas.AssetRead:
    """Met à jour un actif existant sans supprimer d'autres enregistrements."""

    # Vérifier que l'actif existe
    exists_query = text("SELECT id FROM assets WHERE id = :id")
    exists_row = db.execute(exists_query, {"id": asset_id}).first()
    if not exists_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Actif introuvable",
        )

    update_query = text(
        """
        UPDATE assets
        SET
            nom = :nom,
            type = :type,
            numero_de_serie = :numero_de_serie,
            marque = :marque,
            modele = :modele,
            statut = :statut,
            localisation = :localisation,
            departement = :departement,
            date_d_achat = :date_d_achat,
            date_de_fin_garantie = :date_de_fin_garantie,
            prix_d_achat = :prix_d_achat,
            fournisseur = :fournisseur,
            assigned_to_user_id = :assigned_to_user_id,
            assigned_to_name = :assigned_to_name,
            specifications = :specifications,
            notes = :notes,
            updated_at = now()
        WHERE id = :id
        RETURNING
            id,
            nom,
            type,
            numero_de_serie,
            marque,
            modele,
            statut,
            localisation,
            departement,
            date_d_achat,
            date_de_fin_garantie,
            prix_d_achat,
            fournisseur,
            assigned_to_user_id,
            assigned_to_name,
            specifications,
            notes,
            qr_code,
            created_at,
            updated_at,
            created_by
        """
    )

    params = {
        "id": asset_id,
        "nom": asset_in.nom.strip(),
        "type": asset_in.type.strip(),
        "numero_de_serie": asset_in.numero_de_serie.strip(),
        "marque": asset_in.marque.strip(),
        "modele": asset_in.modele.strip(),
        "statut": asset_in.statut.strip() if asset_in.statut else "in_stock",
        "localisation": asset_in.localisation.strip(),
        "departement": asset_in.departement.strip(),
        "date_d_achat": asset_in.date_d_achat,
        "date_de_fin_garantie": asset_in.date_de_fin_garantie,
        "prix_d_achat": asset_in.prix_d_achat,
        "fournisseur": asset_in.fournisseur.strip() if asset_in.fournisseur else None,
        "assigned_to_user_id": asset_in.assigned_to_user_id,
        "assigned_to_name": asset_in.assigned_to_name,
        "specifications": asset_in.specifications,
        "notes": asset_in.notes,
    }

    try:
        row = db.execute(update_query, params).mappings().first()
        db.commit()
    except Exception as exc:  # pragma: no cover - logging simple
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la mise à jour de l'actif: {exc}",
        ) from exc

    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la mise à jour de l'actif",
        )

    return schemas.AssetRead(**row)

