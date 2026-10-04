---
name: sonner-same-id-merges
description: sonner toast(msg, {id}) merges into an existing toast with that id - action/duration/type leak; dismiss+recreate races
metadata:
  type: feedback
---

Re-firing a sonner toast with an `id` already on screen merges `{...old, ...new}` (both in ToastState and in the Toaster's React state), so an omitted `action`/`duration` keeps the previous toast's values, and a previous `type` (success icon) persists since `ExternalToast` can't set `type`.

**Why:** found implementing the shared preference-feedback slot (#24, sonner 2.0.8). `toast.dismiss(id)` then `toast(..., {id})` is not a fix: the Toaster applies dismiss in rAF and the create in setTimeout, so the new toast can get deleted.

**How to apply:** when toasts share an id, set `action` and `duration` explicitly on every call (see `showPreferenceToast` in `lib/push-toast.ts`) and use plain `toast()` rather than typed variants in that slot.
