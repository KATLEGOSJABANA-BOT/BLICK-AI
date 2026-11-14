# Blick AI Firestore Security Specification

## 1. Data Invariants
1. A `UserProfile` document at `/users/{userId}` can only be read, created, updated, or deleted by the authenticated owner whose `request.auth.uid == userId` and `uid == userId`.
2. A `ChatThread` at `/chats/{chatId}` belongs strictly to `userId == request.auth.uid`. No user can read, list, modify, or delete another user's chat threads.
3. A `ChatMessage` at `/chats/{chatId}/messages/{messageId}` must belong to an existing parent `ChatThread` owned by `request.auth.uid`, must match `chatId`, and is immutable once created.
4. A `WorkspaceProject` at `/projects/{projectId}` (website builds or code debugging sessions) belongs strictly to `userId == request.auth.uid`.
5. All document IDs and foreign IDs match `^[a-zA-Z0-9_\-]+$` with length 1–128. All strings enforce bounded `.size()` constraints and all timestamps are server-validated via `request.time`.

## 2. Adversarial "Dirty Dozen" Payloads (All Must Fail with PERMISSION_DENIED)
1. **Unauthenticated read/write**: Any read or write to `/users/u1`, `/chats/c1`, or `/projects/p1` with `auth == null`.
2. **Unverified email write**: Creating a chat with `auth.token.email_verified == false`.
3. **Identity spoofing on create**: User A (`uid: "userA"`) creating `/chats/c1` with `{ userId: "userB", ... }`.
4. **Cross-user PII read**: User A calling `get(/users/userB)`.
5. **Blanket list scraping**: Calling `getDocs(collection(db, "chats"))` without `where("userId", "==", uid)`.
6. **Shadow / Ghost field injection**: Creating `/users/userA` with an extra field `{ isAdmin: true }`.
7. **ID poisoning**: Creating `/chats/invalid$id..with..dots` or a 500-character document ID.
8. **Immutable field mutation**: Updating `/chats/c1` to change `userId` or `createdAt`.
9. **Client timestamp forgery**: Creating `/projects/p1` with a backdated `createdAt` not equal to `request.time`.
10. **Orphaned message creation**: Creating `/chats/nonexistentChat/messages/m1` or creating a message inside another user's chat.
11. **Message tampering**: Attempting to `update` an existing `/chats/c1/messages/m1` document.
12. **Resource exhaustion / oversized payload**: Writing a `title` > 140 chars or `content` > 100,000 chars.
