from __future__ import annotations

import datetime as dt
import hashlib
import secrets
from abc import ABC, abstractmethod

from sqlalchemy.orm import Session

from ..models import Domain


class RegistryError(Exception):
    pass


class DomainUnavailable(RegistryError):
    pass


class RegistryAdapter(ABC):
    """Interface naar een domeinregistry (bijv. SIDN voor .nl, Verisign voor .com).

    De sandbox-implementatie simuleert een registry lokaal. Voor productie
    implementeer je deze interface met EPP (RFC 5730/5731) per registry.
    """

    @abstractmethod
    def is_available(self, db: Session, name: str) -> bool: ...

    @abstractmethod
    def register(self, db: Session, name: str, owner_id: int) -> Domain: ...

    @abstractmethod
    def release(self, db: Session, name: str) -> None: ...


RESERVED_NAMES = {
    "example", "invalid", "localhost", "test", "root", "admin", "administrator",
    "www", "mail", "smtp", "ftp", "ns1", "ns2", "whois", "registrar", "registry",
    "google", "youtube", "facebook", "instagram", "twitter", "x", "tiktok",
    "amazon", "apple", "microsoft", "netflix", "wikipedia", "github", "linkedin",
    "climora", "sidn", "icann", "verisign", "denic", "nic",
}


def _pseudo_taken(name: str) -> bool:
    """Deterministische pseudo-bezettingsgraad zodat zoeken realistisch voelt."""
    digest = hashlib.sha256(name.encode("utf-8")).digest()
    return digest[0] < 140  # ~55% van de namen is 'bezet'


class SandboxRegistry(RegistryAdapter):
    def is_available(self, db: Session, name: str) -> bool:
        label, tld = name.rsplit(".", 1)
        if label in RESERVED_NAMES:
            return False
        if db.query(Domain).filter(Domain.name == name).first():
            return False
        return not _pseudo_taken(name)

    def register(self, db: Session, name: str, owner_id: int) -> Domain:
        from ..tlds import get_tld

        if not self.is_available(db, name):
            raise DomainUnavailable(name)
        info = get_tld(name.rsplit(".", 1)[1])
        if info is None:
            raise RegistryError(f"Niet-ondersteunde TLD: {name}")
        now = dt.datetime.now(dt.timezone.utc)
        domain = Domain(
            name=name,
            tld=info.tld,
            owner_id=owner_id,
            status="active",
            registered_at=now,
            expires_at=now + dt.timedelta(days=365),
            nameservers="",
            transfer_key=secrets.token_hex(16),
        )
        db.add(domain)
        db.commit()
        db.refresh(domain)
        return domain

    def release(self, db: Session, name: str) -> None:
        domain = db.query(Domain).filter(Domain.name == name).first()
        if domain:
            db.delete(domain)
            db.commit()


registry: RegistryAdapter = SandboxRegistry()
