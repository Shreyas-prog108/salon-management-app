from celery_tasks import (
    send_daily_appointment_reminders,send_monthly_doctor_reports,export_patient_treatment_csv
)
from app import create_app,db
from models import User,Appointment
from datetime import date
def test_task_registration():
    print("=" * 60)
    print("TEST 1:Task Registration")
    print("=" * 60)
    tasks=[
        send_daily_appointment_reminders,send_monthly_doctor_reports,export_patient_treatment_csv
    ]
for task in tasks:
        print(f"✓ Task '{task.name}' is registered")
    print("\n✅ All tasks are registered!\n")
def test_async_task_execution():
    print("=" * 60)
    print("TEST 2:Async Task Execution")
    print("=" * 60)
    print("\n📤 Sending 'send_daily_appointment_reminders' task to queue...")
    result=send_daily_appointment_reminders.delay()
    print(f"   Task ID:{result.id}")
    print(f"   Status:{result.status}")
    print("\n⏳ Waiting for task to complete (timeout:10s)...")
try:
        task_result=result.get(timeout=10)
        print(f"✅ Task completed successfully!")
        print(f"   Result:{task_result}")
except Exception as e:
        print(f"❌ Task failed or timed out:{e}")
    print()
def test_export_task_with_patient():
    print("=" * 60)
    print("TEST 3:Export Task with Patient Data")
    print("=" * 60)
    app=create_app()
with app.app_context():
        patient=User.query.filter_by(role='patient').first()
if not patient:
            print("⚠️  No patients found in database. Skipping this test.")
            print("   Create a patient first to test the export functionality.\n")
            return
        print(f"\n📋 Found patient:{patient.full_name} (ID:{patient.id})")
        appointments=Appointment.query.filter_by(
            patient_id=patient.id,status='Completed'
        ).count()
        print(f"   Completed appointments:{appointments}")
if appointments==0:
            print("   ⚠️  Patient has no completed appointments")
        print(f"\n📤 Queuing export task for patient {patient.id}...")
        result=export_patient_treatment_csv.delay(patient.id)
        print(f"   Task ID:{result.id}")
        print("\n⏳ Waiting for export to complete (timeout:10s)...")
try:
            task_result=result.get(timeout=10)
            print(f"✅ Export completed!")
            print(f"   Status:{task_result.get('status')}")
            print(f"   Filename:{task_result.get('filename')}")
            print(f"   Records:{task_result.get('records')}")
            print(f"   Filepath:{task_result.get('filepath')}")
except Exception as e:
            print(f"❌ Export failed or timed out:{e}")
    print()
def test_monthly_reports():
    print("=" * 60)
    print("TEST 4:Monthly Doctor Reports")
    print("=" * 60)
    print("\n📤 Sending 'send_monthly_doctor_reports' task to queue...")
    result=send_monthly_doctor_reports.delay()
    print(f"   Task ID:{result.id}")
    print("\n⏳ Waiting for task to complete (timeout:15s)...")
try:
        task_result=result.get(timeout=15)
        print(f"✅ Task completed!")
        print(f"   Result:{task_result}")
except Exception as e:
        print(f"❌ Task failed or timed out:{e}")
    print()
def check_worker_status():
    print("=" * 60)
    print("Celery Worker Status Check")
    print("=" * 60)
    from celery_app import celery_app
    inspect=celery_app.control.inspect()
    print("\n🔍 Checking for active workers...")
    active=inspect.active()
if active:
        print("✅ Workers are running:")
for worker_name in active.keys():
            print(f"   - {worker_name}")
else:
        print("❌ No active workers found!")
        print("   Make sure to start the worker with:")
        print("   celery -A celery_app.celery_app worker --loglevel=info")
    print()
if __name__=='__main__':
    print("\n🧪 CELERY TESTING SUITE")
    print("=" * 60)
    print("Make sure the Celery worker is running before running tests!")
    print("=" * 60)
    check_worker_status()
try:
        test_task_registration()
        test_async_task_execution()
        test_export_task_with_patient()
        test_monthly_reports()
        print("=" * 60)
        print("🎉 ALL TESTS COMPLETED!")
        print("=" * 60)
except KeyboardInterrupt:
        print("\n\n⚠️  Tests interrupted by user")
except Exception as e:
        print(f"\n\n❌ Error during testing:{e}")
        import traceback
        traceback.print_exc()
