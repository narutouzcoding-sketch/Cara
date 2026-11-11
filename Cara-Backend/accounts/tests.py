from django.test import TestCase

class User:
    def __init__(self, username, role):
        self.username = username
        self.role = role
    def foydalanuvchi_malumoti(self):
        return {
            "username": self.username,
            "role": self.role,
        }
user = User(username="testuser", role="admin")
natija = user.foydalanuvchi_malumoti()
print(natija)