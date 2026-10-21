# Twitch Radar

Tells a viewer when a broadcaster they follow goes live or switches to a category they care about.

## Channel State

**Channel State**: What a broadcaster is doing right now: live or offline, current category and title, and the current stream. One per broadcaster, shared by every user who follows them. _Avoid_: stream status, channel status

**Snapshot**: A Channel State reading taken by polling Twitch, as during follow sync or monitoring seeding. It knows only what Twitch reports at that moment, not what happened before. _Avoid_: sync write, poll result

**Event**: A change Twitch pushes to the app through EventSub (stream online, stream offline, channel update). It is applied on top of the stored Channel State. _Avoid_: webhook, message (when meaning the change itself)

**Stale Event**: An Event older than the last Event already applied to a broadcaster's Channel State. It is ignored. _Avoid_: out-of-order event, late event

**State Change**: A recorded transition of Channel State that matters for notifications, such as going live or switching category. History only; never used to compute the current Channel State. _Avoid_: transition log, history row
