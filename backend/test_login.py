"""
Script pour tester la connexion d'un utilisateur
"""
import requests
import sys

def test_login(username, password):
    base_url = "http://127.0.0.1:8000"
    
    print(f"\n{'='*60}")
    print(f"TEST DE CONNEXION POUR: {username}")
    print(f"{'='*60}\n")
    
    try:
        # Test de connexion
        data = {
            "username": username,
            "password": password,
            "grant_type": "password"
        }
        
        print(f"Envoi de la requête à {base_url}/auth/token...")
        response = requests.post(
            f"{base_url}/auth/token",
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        
        print(f"Status code: {response.status_code}")
        
        if response.status_code == 200:
            token_data = response.json()
            print(f"✓ Connexion réussie!")
            print(f"Token reçu: {token_data.get('access_token', 'N/A')[:50]}...")
            
            # Tester la récupération des infos utilisateur
            headers = {"Authorization": f"Bearer {token_data['access_token']}"}
            user_response = requests.get(f"{base_url}/auth/me", headers=headers)
            
            if user_response.status_code == 200:
                user_data = user_response.json()
                print(f"\n✓ Informations utilisateur récupérées:")
                print(f"  - Nom: {user_data.get('full_name', 'N/A')}")
                print(f"  - Email: {user_data.get('email', 'N/A')}")
                print(f"  - Rôle: {user_data.get('role', {}).get('name', 'N/A')}")
                print(f"  - Statut: {user_data.get('status', 'N/A')}")
            else:
                print(f"\n✗ Erreur lors de la récupération des infos: {user_response.status_code}")
                print(f"  Réponse: {user_response.text}")
        else:
            print(f"✗ Échec de la connexion")
            print(f"  Réponse: {response.text}")
            try:
                error_data = response.json()
                print(f"  Détail: {error_data.get('detail', 'N/A')}")
            except:
                pass
                
    except requests.exceptions.ConnectionError:
        print(f"✗ ERREUR: Impossible de se connecter au backend sur {base_url}")
        print(f"  Vérifiez que le backend est démarré avec: python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000")
    except Exception as e:
        print(f"✗ ERREUR: {e}")
    
    print(f"\n{'='*60}\n")

if __name__ == "__main__":
    if len(sys.argv) == 3:
        test_login(sys.argv[1], sys.argv[2])
    else:
        # Tester avec les comptes par défaut
        print("Test des comptes par défaut:\n")
        test_login("user1", "user123")
        test_login("tech1", "tech123")
        test_login("dsi1", "dsi123")
        test_login("secretary1", "secretary123")




