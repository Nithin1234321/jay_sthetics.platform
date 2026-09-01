# V6 Payment Flow

V6 fixes the signup/payment loop.

Flow:
1. Visitor chooses an exact coaching programme.
2. If not logged in, signup opens with the selected programme displayed.
3. After registration, the client is sent to `/checkout?programId=...`.
4. If already logged in, Join Coaching goes directly to checkout.
5. Checkout creates a Razorpay order on the backend.
6. Razorpay handles UPI/card/net-banking payment.
7. Backend verifies Razorpay signature.
8. Payment is marked SUCCESS.
9. Subscription becomes ACTIVE with start and expiry dates.
10. Client redirects to `/dashboard`.
11. Paid training/nutrition/progress APIs unlock.

## Required before payments work
Add Razorpay credentials to `apps/api/.env`:

RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...

Use TEST keys while developing.

Without keys, V6 now shows a clear 'Razorpay is not connected yet' message instead of looping the user between dashboard and programmes.
