# Unsaved clinical draft navigation — 17 November 2026

Source changes bind investigation editors to the referral ID and category, preventing
a category's in-memory draft from being reused when another referral is displayed.

A shared browser-window registry tracks unsaved PHC forms and investigation drafts.
It requests confirmation before marked Back/Sign Out actions, password-screen
navigation, referral switching and browser unload. Multiple dirty categories
produce one confirmation. Cancelling a navigation click stops it before React's
handler. Cleanup removes listeners when editors unmount and is idempotent.

Save/discard controls are not intercepted. The registry never writes clinical
contents or dirty-state details to persistent storage. Browser unload warnings are
browser-controlled and may require prior user interaction; they cannot guarantee
recovery after a crash or device shutdown.

Eight local unit tests passed for registration, confirmation, unload, event
interception, cleanup and window isolation. Full application browser/keyboard
verification remains open; tests of a synthetic event target are not evidence
of authenticated clinical end-to-end behavior.

Assessment/admission/discharge form navigation and broader session-loss recovery
remain separate audit items. Database and production changes are not included.
