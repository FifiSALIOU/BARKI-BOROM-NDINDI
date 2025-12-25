"""
Script de migration : ajoute la colonne auto_closed_at à la table tickets
"""
from sqlalchemy import text
from app.database import engine, SessionLocal

def migrate_database():
    """Ajoute la colonne auto_closed_at à la table tickets"""
    db = SessionLocal()
    try:
        print("Début de la migration...")
        
        with engine.connect() as conn:
            # Vérifier si la colonne existe déjà
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'tickets' AND column_name = 'auto_closed_at'
            """))
            columns = [row[0] for row in result]
            
            if 'auto_closed_at' not in columns:
                print("Ajout de la colonne 'auto_closed_at' dans la table 'tickets'...")
                conn.execute(text("""
                    ALTER TABLE tickets 
                    ADD COLUMN auto_closed_at TIMESTAMP NULL
                """))
                conn.commit()
                print("OK - Colonne 'auto_closed_at' ajoutée dans 'tickets'")
            else:
                print("OK - La colonne 'auto_closed_at' existe déjà dans 'tickets'")
        
        print("\nMigration terminée avec succès !")
        
    except Exception as e:
        print(f"ERREUR lors de la migration: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    migrate_database()



