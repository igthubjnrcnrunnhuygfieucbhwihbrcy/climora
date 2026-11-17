from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, default=lambda: dt.datetime.now(dt.timezone.utc)
    )

    domains: Mapped[list["Domain"]] = relationship(back_populates="owner")


class Domain(Base):
    __tablename__ = "domains"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(253), unique=True, index=True)
    tld: Mapped[str] = mapped_column(String(63), index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="active")
    registered_at: Mapped[dt.datetime] = mapped_column(
        DateTime, default=lambda: dt.datetime.now(dt.timezone.utc)
    )
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime)
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=False)
    whois_privacy: Mapped[bool] = mapped_column(Boolean, default=True)
    nameservers: Mapped[str] = mapped_column(Text, default="")
    transfer_key: Mapped[str] = mapped_column(String(64))

    owner: Mapped[User] = relationship(back_populates="domains")
    dns_records: Mapped[list["DnsRecord"]] = relationship(
        back_populates="domain", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("name", name="uq_domain_name"),)


class DnsRecord(Base):
    __tablename__ = "dns_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    domain_id: Mapped[int] = mapped_column(ForeignKey("domains.id"), index=True)
    record_type: Mapped[str] = mapped_column(String(10))
    name: Mapped[str] = mapped_column(String(253), default="@")
    value: Mapped[str] = mapped_column(Text)
    ttl: Mapped[int] = mapped_column(Integer, default=3600)
    priority: Mapped[int | None] = mapped_column(Integer, nullable=True)

    domain: Mapped[Domain] = relationship(back_populates="dns_records")
