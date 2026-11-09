from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.functions import Lower


class User(AbstractUser):
    class Role(models.TextChoices):
        CUSTOMER = "customer", "Xaridor"
        SELLER = "seller", "Sotuvchi"

    email = models.EmailField("email manzil", unique=False)
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.CUSTOMER,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower("username"), name="user_username_ci_unique"
            ),
            models.UniqueConstraint(
                Lower("email"), name="user_email_ci_unique"
            ),
        ]

    def __str__(self):
        return self.username


