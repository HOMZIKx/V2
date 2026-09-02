# P4.6 scope lock — recovered from Accepted SoT

Status: `SCOPE_LOCKED`  
Branch: `cursor/p4-1-activity-domain` · PR #19  
After: `P4_5_FINAL_CHECKPOINT_SHA` = `e3c694fcc3980cd309843cac2c42c346083c8cb1`

## Classification

| Topic                                                                                       | Classification                             | Anchor                                              |
| ------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| Recurring series (daily/weekly/selected weekdays, 90d, RSVP one/series, edit/cancel scopes) | **CURRENT_ACCEPTED**                       | product §11, architecture §6 `create.recurring`     |
| Private activities (link and/or roles; link does not bypass membership/Authz)               | **CURRENT_ACCEPTED**                       | product §18, `create.private`                       |
| Attendance: organizer marks present/absent within 24h; no auto penalties                    | **CURRENT_ACCEPTED**                       | product §19, `attendance.record`                    |
| Statistics: self / event organizer / guild moderator scopes                                 | **CURRENT_ACCEPTED**                       | product §19, `stats.read.self` / `stats.read.guild` |
| Issue #21 G8 voice frekwencja                                                               | **CURRENT_ACCEPTED OUT OF SCOPE for P4.6** | Issue #21 PLANNING; not Activity attendance         |
| Full G8 rankings / voice monitoring                                                         | **OUT OF SCOPE**                           | Stage gate after Core Foundation                    |

## Explicit non-goals (P4.6)

- Issue #21 G8 voice attendance module
- Notifications Core #24 (Stage 4)
- Dungeon LFG #20 (Stage 5)
- Hub Core redesign beyond needed adapters
- WWW activity creator

## Implementation order

1. Domain + migrations: `activity_series`, occurrence links, privacy fields, `attendance_records`, stats read models
2. Authorization wiring for recurring/private/attendance/stats
3. API + Admin config surfaces
4. Discord create/edit flows for series + private + attendance marking
5. WWW member: private visibility + own stats
6. Tests + security + CI + Zeabur

## Marker

`READY_FOR_CHATGPT_P4_6_ASYNC_AUDIT` after `P4_6_FINAL_CHECKPOINT_SHA`
