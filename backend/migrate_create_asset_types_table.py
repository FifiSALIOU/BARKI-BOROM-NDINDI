"""
Migration non destructive pour la table de configuration des types d'actifs.

- Crée la table asset_types si elle n'existe pas.
- Pré-remplit quelques types standards.
- NE MODIFIE PAS la table assets ni aucune donnée existante.
"""

from sqlalchemy import text

from app.database import engine, SessionLocal


def table_exists(conn, table_name: str) -> bool:
    """Vérifie si une table existe déjà dans la base."""
    result = conn.execute(
        text(
            """
            SELECT 1
            FROM information_schema.tables
            WHERE table_name = :table_name
            """
        ),
        {"table_name": table_name},
    )
    return result.first() is not None


def migrate_database() -> None:
    """Crée la table asset_types sans toucher aux données existantes."""
    db = SessionLocal()
    try:
        print("Début de la migration de la table des types d'actifs...")

        with engine.connect() as conn:
            if not table_exists(conn, "asset_types"):
                print("Création de la table 'asset_types'...")
                conn.execute(
                    text(
                        """
                        CREATE TABLE asset_types (
                            id          SERIAL PRIMARY KEY,
                            code        TEXT NOT NULL UNIQUE,
                            label       TEXT NOT NULL,
                            is_active   BOOLEAN NOT NULL DEFAULT TRUE
                        );
                        """
                    )
                )
                conn.commit()
                print("OK - Table 'asset_types' créée.")

                # Pré-remplir avec quelques types standards (aucune donnée existante n'est modifiée)
                print("Insertion des types d'actifs par défaut...")
                conn.execute(
                    text(
                        """
                        INSERT INTO asset_types (code, label) VALUES
                            ('desktop', 'Ordinateur fixe'),
                            ('laptop', 'Ordinateur portable'),
                            ('printer', 'Imprimante'),
                            ('monitor', 'Écran'),
                            ('mobile', 'Mobile'),
                            ('tablet', 'Tablette'),
                            ('phone', 'Téléphone'),
                            ('network', 'Équipement réseau')
                        ON CONFLICT (code) DO NOTHING;
                        """
                    )
                )
                conn.commit()
                print("OK - Types d'actifs par défaut insérés.")
            else:
                print("OK - La table 'asset_types' existe déjà, aucune modification effectuée.")

        print("\nMigration terminée avec succès (aucune donnée existante n'a été modifiée).")

    except Exception as e:
        print(f"ERREUR lors de la migration: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    migrate_database()

