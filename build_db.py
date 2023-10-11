from sqlalchemy import text, Boolean, create_engine, Column, Integer, String, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship, sessionmaker, declarative_base
from flask_login import UserMixin
import json

import os
print(os.getcwd())

with open('config.json', 'r') as f:
    config = json.load(f)

Base = declarative_base()

class User(Base, UserMixin):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    email = Column(String, unique=True)
    username = Column(String)
    password = Column(String)

class Project(Base):
    __tablename__ = 'projects'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    name = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    is_completed = Column(Boolean, default=False)
    is_visible = Column(Boolean, default=True)
    
class Task(Base):
    __tablename__ = 'tasks'
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey('projects.id'))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    name = Column(String)
    total_seconds = Column(Integer, default=0)
    is_completed = Column(Boolean, default=False)
    is_visible = Column(Boolean, default=True)

class Log(Base):
    __tablename__ = 'logs'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    task_id = Column(Integer, ForeignKey('tasks.id'))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    description = Column(String)
    is_pinned = Column(Boolean, default=False)

username = 'doadmin'
password = config['POSTGRES_PASS']
host = 'anolog-postgres-db-do-user-14788669-0.b.db.ondigitalocean.com'
port = '25060'
database = 'defaultdb'

engine = create_engine(f'postgresql://{username}:{password}@{host}:{port}/{database}')
#Base.metadata.create_all(engine)
