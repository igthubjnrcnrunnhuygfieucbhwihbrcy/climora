from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(default="", max_length=255)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    created_at: dt.datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class DnsRecordIn(BaseModel):
    record_type: str = Field(pattern="^(A|AAAA|CNAME|MX|TXT|NS|CAA|SRV)$")
    name: str = Field(default="@", max_length=253)
    value: str = Field(min_length=1, max_length=4096)
    ttl: int = Field(default=3600, ge=60, le=86400)
    priority: int | None = Field(default=None, ge=0, le=65535)


class DnsRecordOut(DnsRecordIn):
    id: int

    model_config = {"from_attributes": True}


class DomainOut(BaseModel):
    id: int
    name: str
    tld: str
    status: str
    registered_at: dt.datetime
    expires_at: dt.datetime
    auto_renew: bool
    whois_privacy: bool
    nameservers: str

    model_config = {"from_attributes": True}


class DomainDetail(DomainOut):
    dns_records: list[DnsRecordOut] = []


class NameserversIn(BaseModel):
    nameservers: list[str] = Field(min_length=1, max_length=6)


class DomainFlagsIn(BaseModel):
    auto_renew: bool | None = None
    whois_privacy: bool | None = None


class SearchHit(BaseModel):
    domain: str
    tld: str
    available: bool
    price: float
    restriction: str
    restriction_label: str


class SearchResponse(BaseModel):
    query: str
    results: list[SearchHit]
