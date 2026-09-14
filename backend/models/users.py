"""Pydantic models for users and authentication."""

from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Role = Literal["administrator", "normal_user"]


class UserOut(BaseModel):
    """User as exposed over the API — never includes the password hash."""

    id: str
    name: str
    email: str
    role: Role
    assigned_category_ids: list[str] = Field(default_factory=list)
    department_id: str = ""  # -> departments.id; drives note sharing/editing by department
    department_name: str = ""
    is_active: bool = True


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    role: Role = "normal_user"
    assigned_category_ids: list[str] = Field(default_factory=list)
    department_id: str = Field(default="", max_length=60)
    is_active: bool = True


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)
    role: Role | None = None
    assigned_category_ids: list[str] | None = None
    department_id: str | None = Field(default=None, max_length=60)
    is_active: bool | None = None
