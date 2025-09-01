from urllib import response
from flask_mail import Mail, Message
from flask import session as flask_session
from flask import Flask, request, jsonify, render_template, Response, redirect, url_for, abort
from build_db import User, Project, Task, Log, Time, engine
from sqlalchemy.orm import relationship, sessionmaker, scoped_session
from sqlalchemy import desc, func, String, Numeric, cast, extract
from datetime import datetime, timedelta
from openpyxl import Workbook
from io import StringIO
import csv
import bcrypt
import pytz
import json
import os
import io

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
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 465
app.config['MAIL_USERNAME'] = 'brayden@braydenmoore.com' 
app.config['MAIL_PASSWORD'] = config['GOOGLE_PASS']
app.config['MAIL_USE_TLS'] = False
app.config['MAIL_USE_SSL'] = True
app.config['SECURITY_PASSWORD_SALT'] = config['SALT_PASS']

def get_client_ip(request):
    x_forwarded_for = request.headers.get('X-Forwarded-For')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.headers.get('X-Real-IP') or request.remote_addr
    return ip

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
            if request.form.get('phone'):
                ip = get_client_ip(request)
                html = render_template('bot.html', ip=ip, email=request.form['email'])
                #send_email(app.config['MAIL_USERNAME'], f'Anolog - Bot Blocked', html)
                abort(400) 

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
        tasks = session.query(Task).filter(Task.project_id==project_id, Task.is_visible==True).order_by(Task.is_completed.asc(), Task.name.asc()).all()
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

        logs = session.query(Log).filter(Log.task_id == task_id, Log.is_visible != False).order_by(func.coalesce(Log.is_pinned, False).desc(), desc(Log.created_at)).all()
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
        
        tz_name = request.args.get('tz_name', 'UTC')
        local_tz = pytz.timezone(tz_name)

        month = int(request.args.get('month')) + 1
        year = int(request.args.get('year'))

        start_of_month = local_tz.localize(datetime(year, month, 1))

        if month == 12:
            next_month = local_tz.localize(datetime(year + 1, 1, 1))
        else:
            next_month = local_tz.localize(datetime(year, month + 1, 1))
            
        query_results = (
            session.query(Time.id, Task.id, Task.name, Time.start, Time.end, Time.duration, Time.description)
            .join(Task, Time.task_id == Task.id)
            .filter(
                Time.project_id == project_id,
                Time.is_visible == True,
                Time.start >= start_of_month,
                Time.start < next_month,
                Time.end != None,
                Time.duration > 0
            )
            .order_by(Time.start)
        ).all()

        time_json = [
            {
                'id': time_id, 
                'project_id': project_id,
                'task_id': task_id,
                'task_name': task_name,
                'start': start.strftime('%Y-%m-%dT%H:%M'), 
                'end': end.strftime('%Y-%m-%dT%H:%M'), 
                'duration': duration,
                'description': 'Add a description...' if not description else description
            }
            for time_id, task_id, task_name, start, end, duration, description in query_results
        ]

        return time_json

    finally:    
        Session.remove()

# List hours by day
@app.route('/days', methods=['GET'])
@login_required
def get_days():

    tz_name = request.args.get('tz_name', 'UTC')
    local_tz = pytz.timezone(tz_name)
    month = int(request.args.get('month')) + 1
    year = int(request.args.get('year'))

    try:
        session = Session()
        data = (
            session.query(
                func.date_trunc('day', func.timezone('US/Eastern', Time.start)).label('day'),
                func.sum(Time.duration),
                func.min(func.timezone('US/Eastern', Time.start)).label('earliest_start'),
                func.max(func.timezone('US/Eastern', Time.end)).label('latest_end')
            )
            .filter(
                Time.user_id == current_user.id, 
                Time.is_visible == True,
                func.extract('month', func.timezone('US/Eastern', Time.start)) == month,
                func.extract('year', func.timezone('US/Eastern', Time.start)) == year
            )
            .group_by(func.date_trunc('day', func.timezone('US/Eastern', Time.start)))
            .order_by('day')
        ).all()

        day_json = {}
        for day, total_duration, _, _ in data:
            day_dict = {}
            day_number = day.day
            day_dict['date'] = day
            day_dict['hours'] = round(total_duration/60/60,2) #format_duration(total_duration)
            day_dict['duration'] = total_duration
            day_json[day_number] = day_dict

        return day_json
    
    finally:
        Session.remove()

def format_duration(duration):
    """Convert duration in decimal hours to hh:mm format."""
    duration = duration/60/60
    hours = int(duration)
    minutes = int((duration - hours) * 60)
    return f"{hours:02d}:{minutes:02d}"

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
        project_id = data['projectId']
        task_id = data['taskId']
        start = data['start']
        end = data['end']
        duration = data['duration']
        description = None if data['description'] == 'undefined' else data['description']

        new_time = Time(user_id=current_user.id, project_id=project_id, task_id=task_id, start=start, end=end, duration=duration, description=description)
        session.add(new_time)

        project = session.query(Project).filter(Project.id == project_id).first()
        task = session.query(Task).filter(Task.id == task_id).first()
        project.updated_at = datetime.now()
        task.updated_at = datetime.now()

        session.commit()

        return jsonify({"message": "Time block updated", "id":new_time.id}), 201
    
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

        log_id = data.get('logId')
        log = session.query(Log).filter(Log.id == log_id).first()

        task_id = data.get('taskId')
        task = session.query(Task).filter(Task.id == task_id).first()
        task.updated_at = datetime.now()
        
        project_id = data.get('projectId')
        project = session.query(Project).filter(Project.id == project_id).first()
        project.updated_at = datetime.now()
        
        is_pinned = data.get('isPinned')
        new_description = data.get('newDescription')
        delete = data.get('delete')

        if is_pinned is not None:
            log.is_pinned = is_pinned
        if new_description is not None:
            log.description = new_description
        if delete is not None:
            log.is_visible = False

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
        description = data.get('description')
        is_visible = data.get('isVisible')

        if time_id == '-1':
                    time = Time(user_id=current_user.id, project_id=project_id, task_id=task_id, start=start, end=end, duration=duration, description=description)
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
                time.description = description

            project = session.query(Project).filter(Project.id == project_id).first()
            task = session.query(Task).filter(Task.id == task_id).first()
            project.updated_at = datetime.now()
            task.updated_at = datetime.now()

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

import pandas as pd
from openpyxl.utils.dataframe import dataframe_to_rows
def make_tab(df, wb, sheet_name):
    ws = wb.create_sheet(sheet_name)
    for r in dataframe_to_rows(df, index=False, header=True):
        ws.append(r)

# Export as csv
@app.route('/export_csv', methods=['GET'])
@login_required
def export_csv():
    session = Session() 
    user_id = request.args.get('user_id')
    project_id = request.args.get('project_id')
    task_id = request.args.get('task_id')
    time = request.args.get('time')
    days = request.args.get('days')
    auth = request.args.get('auth')
    selected_month = int(request.args.get('month')) + 1
    selected_year = int(request.args.get('year'))
    next_month = selected_month + 1 if selected_month != 12 else 1
    next_year = selected_year if selected_month != 12 else selected_year + 1

    output = StringIO()
    csv_writer = csv.writer(output)
    model = None
    the_time = datetime.now().strftime('%Y%m%d%H%M')

    try:
        if user_id:
            data = session.query(Project).filter(Project.user_id==user_id, Project.is_visible==True).order_by(Project.created_at.asc()).all()
            model = Project
            filename = f"anolog_projects_{the_time}.csv"
        elif auth=='0':
            data = session.query(User).order_by(User.created_at.asc()).all()
            model = User
            filename = f"anolog_users_{the_time}.csv"   
        elif project_id:   
            data = session.query(Task).filter(Task.project_id==project_id, Task.is_visible==True).order_by(Task.created_at.asc()).all()
            model = Task
            filename = f"anolog_tasks_{the_time}.csv"
        elif time:
            data = (
                session.query(Time, Task.name)
                .join(Task, Time.task_id == Task.id)
                .filter(Time.project_id == time, Time.is_visible == True, Time.start >= datetime(selected_year, selected_month, 1), Time.start < datetime(next_year, next_month, 1))
                .order_by(Time.start.asc())
                .all()
            )  
            model = Time
            filename = f"anolog_time_{the_time}.csv"
        elif days:
            data = (
                session.query(
                    func.date_trunc('day', func.timezone('US/Eastern', Time.start)).label('day'),
                    func.sum(Time.duration).label('total_duration'),
                    func.min(func.timezone('US/Eastern', Time.start)).label('earliest_start'),
                    func.max(func.timezone('US/Eastern', Time.end)).label('latest_end'),
                    func.string_agg(
                        Task.name + ' - ' + cast(func.round(Time.duration / 3600.0, 2), String), ', '
                    ).label('Note')
                )
                .join(Task, Time.task_id == Task.id)  
                .filter(Time.project_id == days, Time.is_visible == True)
                .group_by(func.date_trunc('day', func.timezone('US/Eastern', Time.start)))
                .order_by('day')
            ).all()

            model = None 
            filename = f"anolog_time_{the_time}.csv"

            if data:
                csv_writer.writerow(['Date', 'Total Hours', 'Formatted Hours', 'Start Time', 'End Time', 'Note'])  
                for day, total_duration, earliest_start, latest_end, note in data:
                    csv_writer.writerow([
                        day,#.strftime('%Y-%m-%d'),
                        total_duration/60/60, 
                        format_duration(total_duration),
                        earliest_start.strftime('%Y-%m-%d %H:%M:%S') if earliest_start else '', 
                        latest_end.strftime('%Y-%m-%d %H:%M:%S') if latest_end else '',
                        note
                    ])

        if model and filename:
            if model == Time:                
                wb = Workbook()
                wb.remove(wb.active)
                columns_list = list(model.__table__.columns)
                
                # Convert to DataFrame
                rows_data = []
                for row, project in data:
                    row_dict = {}
                    for column in columns_list[4:-1]:
                        value = getattr(row, column.name)
                        if column.name in ['start', 'end'] and value and hasattr(value, 'tzinfo') and value.tzinfo:
                            value = value.replace(tzinfo=None)
                        row_dict[column.name] = value
                    row_dict['project'] = project
                    row_dict['hours'] = getattr(row, 'duration') / 3600
                    rows_data.append(row_dict)
                
                df = pd.DataFrame(rows_data)
                df.columns = [str(i.name).title() for i in columns_list[4:-1]]
                
                # Summary tab
                summary = df.groupby('project')['hours'].sum().reset_index()
                make_tab(summary, wb, 'Summary')
                
                # Individual project tabs
                for project in df['project'].unique():
                    project_df = df[df['project'] == project]
                    sheet_name = str(project)[:31]  # Excel sheet name limit
                    make_tab(project_df, wb, sheet_name)
                
                filename = filename.replace('.csv', '.xlsx')
                excel_buffer = io.BytesIO()
                wb.save(excel_buffer)
                excel_buffer.seek(0)
                
                return Response(
                    excel_buffer.getvalue(),
                    mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    headers={"Content-disposition": f"attachment; filename={filename}"}
                )
        else: 
            output.seek(0)
    
            return Response(
                output,
                mimetype="text/csv" if not time else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                headers={"Content-disposition": f"attachment; filename={filename}"}
            )

    finally:
        Session.remove()


if __name__ == '__main__':
    app.run(debug=True)
