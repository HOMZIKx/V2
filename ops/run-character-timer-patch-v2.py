from pathlib import Path
import runpy

path = Path('ops/patch-character-timer-reminders.py')
script = path.read_text(encoding='utf-8')
start_marker = '''replace_once(
    path,
    "  const copy = buildCharacterTimerNotifyCopy({",'''
end_marker = '# Gateway payload schema carries the explicit product lead time.'
start = script.find(start_marker)
end = script.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('could not locate web notify patch block')
replacement = '''replace_once(
    path,
    "  const timer = timerForNotify(ctx);\\n",
    "  const timer = timerForNotify(ctx);\\n  const progressionKind = timer.kind ?? inferProgressionKind(timer.label);\\n  const reminderMinutesBefore = progressionReminderMinutesBefore(progressionKind);\\n",
)
# Add the explicit product lead time to both reset fan-out and direct actor payloads.
value = text(path)
needle = "        ...(timer.readyAtIso ? { endsAt: timer.readyAtIso } : {}),\\n"
if value.count(needle) != 2:
    raise SystemExit(f'{path}: expected two notify endsAt payloads, got {value.count(needle)}')
value = value.replace(needle, needle + "        reminderMinutesBefore,\\n")
write(path, value)

'''
path.write_text(script[:start] + replacement + script[end:], encoding='utf-8')
runpy.run_path(str(path), run_name='__main__')
