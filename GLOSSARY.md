# Calendar of Meetings

A shared calendar for booking meeting slots: people pick a day, choose one of its
free time slots, and reserve it for a meeting.

## Language

**Shared password**:
The single secret that gates the calendar; knowing it is the only way in.
_Avoid_: access code, master password, login

**Session**:
A period during which someone who entered the shared password may use the app,
carrying the Booker name they declared.
_Avoid_: cookie, token, login

**Booker**:
The self-declared name attached to a booking. It is not an identity and carries
no rights.
_Avoid_: owner, user, account

**Authenticated**:
Describes a request or viewer that carries a valid session.
_Avoid_: logged in, authorized

**Anonymous**:
Describes a request or viewer with no session.
_Avoid_: guest, visitor, public
