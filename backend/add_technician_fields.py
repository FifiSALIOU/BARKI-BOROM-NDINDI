"""
Script pour ajouter les colonnes work_hours, availability_status, max_tickets_capacity, notes à la table users
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = (
    f"postgresql://{os.getenv('POSTGRES_USER', 'tickets_user')}:"
    f"{os.getenv('POSTGRES_PASSWORD', 'password')}@"
    f"{os.getenv('POSTGRES_HOST', 'localhost')}:"
    f"{os.getenv('POSTGRES_PORT', '5432')}/"
    f"{os.getenv('POSTGRES_DB', 'tickets_db')}"
)

engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)

def add_technician_fields():
    db = Session()
    try:
        print("Ajout des colonnes pour les techniciens à la table 'users'...")
        
        # Liste des colonnes à ajouter
        columns = [
            ("work_hours", "VARCHAR(200)", "Plages horaires"),
            ("availability_status", "VARCHAR(20) DEFAULT 'disponible'", "Statut de disponibilité"),
            ("max_tickets_capacity", "INTEGER", "Capacité max de tickets simultanés"),
            ("notes", "TEXT", "Notes optionnelles")
        ]
        
        for column_name, column_type, description in columns:
            # Vérifier si la colonne existe déjà
            check_query = text(f"""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='users' AND column_name='{column_name}';
            """)
            result = db.execute(check_query).fetchone()
            
            if result:
                print(f"OK - La colonne '{column_name}' existe déjà dans 'users'")
            else:
                # Ajouter la colonne
                db.execute(text(f"ALTER TABLE users ADD COLUMN {column_name} {column_type};"))
                db.commit()
                print(f"OK - Colonne '{column_name}' ({description}) ajoutée avec succès")
        
        print("\nMigration terminée avec succès !")

    except Exception as e:
        db.rollback()
        print(f"ERREUR lors de la migration: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    add_technician_fields()


