from urllib import response
from flask import session as flask_session
from flask import Flask, request, jsonify, render_template, Response, redirect, url_for
from build_db import User, Project, Task, Log, Time, engine
from sqlalchemy.orm import relationship, sessionmaker, scoped_session
from sqlalchemy import desc, func
from datetime import datetime, timedelta
from io import StringIO
import csv
import bcrypt
import json

import os
print(os.getcwd())

try: 
    with open('config.json', 'r') as f:
        config = json.load(f)
except:
    config = {'GOOGLE_PASS':os.environ['GOOGLE_PASS'],
            'POSTGRES_PASS':os.environ['POSTGRES_PASS'],
            'SALT_PASS':os.environ['SALT_PASS'],
            'FLASK_KEY':os.environ['FLASK_KEY']}

Session = scoped_session(sessionmaker(bind=engine))

app = Flask(__name__)
app.config['SECRET_KEY'] = config['FLASK_KEY']
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(weeks=4)

## Login

from flask_login import LoginManager, login_user, logout_user, login_required, current_user
import re

login_manager = LoginManager()
login_manager.login_view = 'login'
login_manager.init_app(app)

@login_manager.user_loader
def load_user(user_id):
    session = Session()
    try:
        return session.query(User).get(int(user_id))
    finally:
        Session.remove()

@app.route('/login', methods=['GET', 'POST'])
def login():
    message = ''
    if request.method == 'POST':
        session = Session()
        try:
            email = request.form['email']
            if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
                message = "Try a different email"
                return render_template('login.html', message=message)

            password = request.form['password']
            user = session.query(User).filter_by(email=email).first()

            if user is None:
                hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                new_user = User(email=email, password=hashed_password)
                session.add(new_user)
                session.commit()

                new_project = Project(user_id=new_user.id, name='New Project')
                session.add(new_project)
                session.commit()
                
                new_task = Task(project_id=new_project.id, name='New Task')
                session.add(new_task)
                session.commit()
                login_user(new_user, remember=True)
                
                html = render_template('welcome_email.html')
                send_email(email, 'Anolog - Welcome', html)
                return redirect(url_for('homepage'))

            if user:
                if user.password.startswith('$2b$'):  
                    if bcrypt.checkpw(password.encode('utf-8'), user.password.encode('utf-8')):
                        login_user(user, remember=True)
                        return redirect(url_for('homepage'))
                    else:
                        message = 'Incorrect Password'
                else:
                    message = 'Invalid stored password format'

        finally:
            Session.remove()

    return render_template('login.html', message=message)

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))


## Mail

from flask_mail import Mail, Message

app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 465
app.config['MAIL_USERNAME'] = 'brayden@braydenmoore.com' 
app.config['MAIL_PASSWORD'] = config['GOOGLE_PASS']
app.config['MAIL_USE_TLS'] = False
app.config['MAIL_USE_SSL'] = True
app.config['SECURITY_PASSWORD_SALT'] = config['SALT_PASS']

mail = Mail(app)

from itsdangerous import URLSafeTimedSerializer

def generate_token(email):
    serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'])
    return serializer.dumps(email, salt=app.config['SECURITY_PASSWORD_SALT'])

def send_email(to, subject, template):
    msg = Message(
        subject,
        recipients=[to],
        html=template,
        sender=app.config['MAIL_USERNAME']
    )
    mail.send(msg)

def confirm_token(token, expiration=3600):
    serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'])
    try:
        email = serializer.loads(
            token,
            salt=app.config['SECURITY_PASSWORD_SALT'],
            max_age=expiration
        )
    except:
        return False
    return email


## Forgot password

@app.route('/forgot-password', methods=['POST'])
def forgot_password():
    data = request.json
    email = data['email']
    token = generate_token(email)
    reset_url = url_for('reset_password', token=token, _external=True)
    html = render_template('reset_password_email.html', reset_url=reset_url)
    send_email(email, 'Anolog - Password Reset', html)
    return jsonify({"message": "Email sent"}), 200

@app.route('/reset-password/<token>', methods=['GET'])
def reset_password(token):
    email = confirm_token(token)  
    if email is False:
        return "The confirmation link is invalid or has expired.", 400
    
    return render_template('reset_password.html', token=token, email=email)

@app.route('/reset-password-final', methods=['POST'])
def reset_password_final():
    session = Session()
    try:
        token = request.form['token']
        new_password = request.form['password']
        email = confirm_token(token)
        
        if email is False:
            return "The confirmation link is invalid or has expired.", 400
        
        user = session.query(User).filter_by(email=email).first()
        user.password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        session.commit()
        login_user(user)
        return redirect(url_for('homepage'))
    
    finally:
        Session.remove()


## App

@app.route('/')
@login_required
def homepage():
    try:
        if current_user.is_authenticated:
            user_id = current_user.id
            session = Session()
            user = session.query(User).filter(User.id==user_id).first()
            primary_color = '#DDDDDD' if not user.color else user.color
            darkmode = False if not user.darkmode else user.darkmode
        return render_template('index.html', user_id=user_id, primary_color=primary_color, darkmode=darkmode)
    finally:
        Session.remove()

## Get
# List all projects
@app.route('/projects', methods=['GET'])
@login_required
def list_projects():
    if current_user.is_authenticated:
        session = Session()
        try:
            user_id = current_user.id

            projects = session.query(Project).filter(Project.user_id==user_id, Project.is_visible==True).order_by(Project.is_completed.asc(), Project.updated_at.desc()).all()
            projects_json = [
                {
                    'id':project.id,
                    'name':project.name,
                    'user_id':project.user_id, 
                    'is_visible':project.is_visible, 
                    'is_completed':project.is_completed
                }
                for project in projects
            ]
            
            return projects_json
        finally:
            Session.remove()
    else:
        return "Not logged in", 401

# List tasks
@app.route('/tasks', methods=['GET'])
@login_required
def list_tasks():
    session = Session()
    try:
        project_id = request.args.get('project_id')
        tasks = session.query(Task).filter(Task.project_id==project_id, Task.is_visible==True).order_by(Task.is_completed.asc(), Task.updated_at.desc()).all()
        tasks_json = [{'id':task.id,'name':task.name,'total_seconds':task.total_seconds, 'is_completed':task.is_completed, 'is_visible':task.is_visible} for task in tasks]
        
        return tasks_json
    finally:
        Session.remove()

# List log entries
@app.route('/logs', methods=['GET'])
@login_required
def list_logs():
    session = Session()
    try:
        task_id = request.args.get('task_id')

        logs = session.query(Log).filter(Log.task_id == task_id).order_by(func.coalesce(Log.is_pinned, False).desc(), desc(Log.created_at)).all()
        logs_json = [{'id':log.id,'description':log.description,'created_at':log.created_at, 'is_pinned':log.is_pinned} for log in logs]

        return logs_json
    
    finally:
        Session.remove()

# List time blocks
@app.route('/time', methods=['GET'])
@login_required
def list_time():
    session = Session()
    try:

        project_id = request.args.get('project_id')

        query_results = (
            session.query(Time.id, Task.id, Task.name, Time.start, Time.end, Time.duration)
            .join(Task, Time.task_id == Task.id)
            .filter(Time.project_id == project_id, Time.is_visible == True)
            .order_by(Time.start)
        ).all()

        time_json = [
            {
                'id': time_id, 
                'task_id': task_id,
                'task_name': task_name,
                'start': start.strftime('%Y-%m-%dT%H:%M'), 
                'end': end.strftime('%Y-%m-%dT%H:%M'), 
                'duration': duration
            } 
            for time_id, task_id, task_name, start, end, duration in query_results
        ]

        return time_json

    finally:    
        Session.remove()

# Get up-to-date project hours
@app.route('/hours', methods=['GET'])
@login_required
def get_hours():
    session = Session()
    try:
        project_id = request.args.get('project_id')
        total_hours = 0
        all_tasks = session.query(Task).filter(Task.project_id==project_id, Task.is_visible==True).all()
        for task in all_tasks:
            total_hours += (task.total_seconds / 60 /60)
        return jsonify({'total_hours':round(total_hours,2)})

    finally:
        Session.remove()

## Create
# Create a new project
@app.route('/projects', methods=['POST'])
@login_required
def create_project():
    session = Session()
    try:
        data = request.json
        new_project = Project(name=data['name'], user_id=data['user_id'])
        session.add(new_project)
        session.commit()
    
        new_task = Task(project_id=new_project.id, name='New Task', is_visible=True)
        print('Project id',new_project.id)
        print('Task project id',new_task.project_id)
        session.add(new_task)
        session.commit()
        return jsonify({"message": "Project created", "id":new_project.id}), 201

    finally:
        Session.remove()

# Create a new task
@app.route('/tasks', methods=['POST'])
@login_required
def create_task():
    session = Session()
    try:
        data = request.json
        project_id = data['projectId']
        task_name = data['taskName']

        project = session.query(Project).filter(Project.id==project_id).first()
        project.updated_at = datetime.now()

        new_task = Task(name=task_name, project_id=project_id)
        session.add(new_task)
        session.commit()

        return jsonify({"message": "Task created", "id":new_task.id, "name":task_name}), 201
    
    finally:
        Session.remove()

# Create a new log
@app.route('/logs', methods=['POST'])
@login_required
def create_log():
    session = Session()
    try:
        data = request.json
        print(data)
        task_id = data['taskId']
        created_at = data['createdAt']
        description = data['description']

        task = session.query(Task).filter(Task.id == task_id).first()
        project = session.query(Project).filter(Project.id == task.project_id).first()
        task.updated_at = datetime.now()
        project.updated_at = datetime.now()

        new_log = Log(task_id=task_id, created_at=created_at, description=description)
        session.add(new_log)
        session.commit()

        return jsonify({"message": "Log created", "id":new_log.id, "created_at":new_log.created_at, "description":new_log.description}), 201
    
    finally:
        Session.remove()

# Create a new time block
@app.route('/time', methods=['POST'])
@login_required
def create_time():
    session = Session()
    try:
        data = request.json
        print(data)
        project_id = data['projectId']
        task_id = data['taskId']
        start = data['start']
        end = data['end']
        duration = data['duration']

        new_time = Time(user_id=current_user.id, project_id=project_id, task_id=task_id, start=start, end=end, duration=duration)
        session.add(new_time)
        session.commit()

        return jsonify({"message": "Time block created", "id":new_time.id}), 201
    
    finally:
        Session.remove()


## Update
# Update a project
@app.route('/projects', methods=['PUT'])
@login_required
def update_project():
    session = Session()
    try:
        data = request.json
        print('Project put',data)
        project_id = data.get('projectId')
        project = session.query(Project).filter(Project.id == project_id).first()   
        project.updated_at = datetime.now()

        name = data.get('name')
        is_visible = data.get('isVisible')
        is_completed = data.get('isCompleted')

        if name:
            project.name = name
        if is_visible is not None:
            project.is_visible = is_visible
            print(project.is_visible)
        if is_completed is not None:
            project.is_completed = is_completed

        session.commit()
        return jsonify({"message": "Project updated"}), 200
    
    finally:
        Session.remove()

# Update a task
@app.route('/tasks', methods=['PUT'])
@login_required
def update_task():
    session = Session()
    try:
        data = request.json
        print('Task put',data)
        task_id = data.get('taskId')
        
        task = session.query(Task).filter(Task.id == task_id).first()
        project_id = task.project_id
        project = session.query(Project).filter(Project.id == project_id).first()
        task.updated_at = datetime.now()
        project.updated_at = datetime.now()

        name = data.get('name')
        is_completed = data.get('isCompleted')
        is_visible = data.get('isVisible')
        total_seconds = data.get('totalSeconds')

        if name:
            task.name = name
        if is_completed is not None:
            task.is_completed = is_completed
        if is_visible is not None:
            task.is_visible = is_visible
        if total_seconds:
            task.total_seconds = total_seconds

        session.commit()
        return jsonify({"message": "Task updated"}), 200
    
    finally:
        Session.remove()

# Update a log
@app.route('/logs', methods=['PUT'])
@login_required
def update_log():
    session = Session()
    try:
        data = request.json
        print('Log put',data)

        log_id = data.get('logId')
        log = session.query(Log).filter(Log.id == log_id).first()

        is_pinned = data.get('isPinned')

        if is_pinned is not None:
            log.is_pinned = is_pinned

        task_id = data.get('taskId')
        
        session.commit()
        return jsonify({"message": "Log updated"}), 200
    
    finally:
        Session.remove()

# Update a time block
@app.route('/time', methods=['PUT'])
@login_required
def update_time():
    session = Session()
    try:
        data = request.json
        time_id = data.get('timeId')
        project_id = data.get('projectId')
        task_id = data.get('taskId')
        start = data.get('start')
        end = data.get('end')
        duration = data.get('duration')
        is_visible = data.get('isVisible')

        if time_id == '-1':
                    time = Time(user_id=current_user.id, project_id=project_id, task_id=task_id, start=start, end=end, duration=duration)
                    session.add(time)
                    session.commit()
        else:
            time = session.query(Time).filter(Time.id == time_id).first()

            if is_visible is not None:
                time.is_visible = is_visible
            else:
                time.start = start
                time.end = end
                time.duration = duration

            session.commit()
        
        return jsonify({"message": "Time block updated",
                        "time_id": time.id}), 200

    finally:
        Session.remove()


# Update a user
@app.route('/user', methods=['PUT'])
@login_required
def update_user():
    session = Session()
    try:
        data = request.json
        print('User put', data)

        user_id = current_user.id
        color = data.get('color')
        darkmode = data.get('darkmode')
        user = session.query(User).filter(User.id == user_id).first()

        if color is not None:
            user.color = color 
        if darkmode is not None:
            user.darkmode = darkmode
        
        session.commit()
        return jsonify({"message": "User updated"}), 200
    
    finally:
        Session.remove()

## Export
# Export as csv
@app.route('/export_csv', methods=['GET'])
@login_required
def export_csv():
    session = Session() 
    user_id = request.args.get('user_id')
    project_id = request.args.get('project_id')
    task_id = request.args.get('task_id')
    time = request.args.get('time')

    output = StringIO()
    csv_writer = csv.writer(output)
    model = None
    the_time = datetime.now().strftime('%Y%m%d%H%M')

    try:
        if user_id:
            data = session.query(Project).filter(Project.user_id==user_id, Project.is_visible==True).order_by(Project.created_at.asc()).all()
            model = Project
            filename = f"anolog_projects_{the_time}"
        elif project_id:   
            data = session.query(Task).filter(Task.project_id==project_id, Task.is_visible==True).order_by(Task.created_at.asc()).all()
            model = Task
            filename = f"anolog_tasks_{the_time}"
        elif task_id:
            data = session.query(Log).filter(Log.task_id==task_id).order_by(Log.created_at.asc()).all()
            model = Log
            filename = f"anolog_logs_{the_time}"
        elif time:
            data = (
                session.query(Time)
                .filter(Time.project_id == time, Time.is_visible == True)
                .order_by(Time.start)
            ).all()     
            model = Time
            filename = f"anolog_time_{the_time}"

        if model:
            csv_writer.writerow([column.name for column in model.__table__.columns])
            for row in data:
                csv_writer.writerow([getattr(row, column.name) for column in model.__table__.columns])
        
    finally:
        Session.remove()
    
    output.seek(0)
    
    return Response(
        output,
        mimetype="text/csv",
        headers={"Content-disposition": f"attachment; filename={filename}.csv"}
    )


if __name__ == '__main__':
    app.run(debug=True)
