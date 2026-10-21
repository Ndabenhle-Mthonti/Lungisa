# Full loop test

Run the app with `npm run dev` and open the printed address (usually `http://localhost:5173`). Use three separate browser profiles so the three sessions stay signed in together. Every seed password is `LungisaDev123`.

| Profile | Person | Email | Lands on |
| --- | --- | --- | --- |
| Tenant | Lerato, Flat 1A | `lerato@seed.lungisa.test` | Home |
| Landlord | Thandi | `thandi@seed.lungisa.test` | Dashboard |
| Provider | Sipho, plumber | `sipho@seed.lungisa.test` | My Jobs Today |

Use a description you can spot, such as `Kitchen tap is dripping - loop test`.

1. **Tenant reports the problem.** On Home, choose **+ Report New Problem**. Pick Plumbing, type the description, take a photo, and choose **Send to Landlord**.
   - Tenant sees “Sent! Your landlord has been notified. We will update you here.”
   - Back on Home, the new card shows Plumbing, the description, **Pending**, and today’s reported date.
   - Landlord Dashboard: **New** goes up by one. The jobs table shows Flat 1A, Plumbing, that description, Lerato, her phone, the photo, status **Pending**, and **Assign Provider**.
   - Provider My Jobs Today does not show this job.

2. **Landlord assigns Sipho.** On that row choose **Assign Provider**, pick **Sipho - Plumber**, then **Assign Now**.
   - Landlord sees “Sipho - Plumber was assigned to Flat 1A.” The row status is **Assigned**. **Assign Provider** is replaced by **Reassign** and **View Details**. **New** goes down by one and **In Progress** goes up by one.
   - Tenant Home, after it updates on its own or after **Refresh**, shows **In Progress**. Open the request: the badge is **In Progress**, the problem photo is there, and there is no finished-work photo.
   - Provider My Jobs Today shows a card “Flat 1A - Plumbing”, Lerato, her phone, **Call**, the issue, **VIEW PHOTO**, status **Assigned**, and **I AM ON MY WAY**. If it is missing, pull down from the top until **Release to refresh**, or press **Refresh**.

3. **Provider is on the way.** On that card choose **I AM ON MY WAY**.
   - Provider: the status becomes **On the way**. **I AM ON MY WAY** is replaced by **MARK AS DONE + UPLOAD PROOF PHOTO** and **Confirm: Job Done**. Confirm stays disabled.
   - Tenant Home and the open request show **Provider is on the way**.
   - Landlord row status is **On the way**. **Reassign** is gone. **View Details** remains. The stat cards stay in **In Progress**.

4. **Provider marks it done.** Choose **MARK AS DONE + UPLOAD PROOF PHOTO**, take a photo, then **Confirm: Job Done**.
   - Before confirm, the card shows the preview and **Retake**, and **Confirm: Job Done** is enabled.
   - After confirm, provider sees “Flat 1A - Plumbing is done. The proof photo was saved.” That card leaves My Jobs Today.
   - Tenant Home shows **Done**. The request shows **Done**, **Photo of the finished work**, and **Not fixed**.
   - Landlord: the row status is **Done**. **In Progress** goes down by one and **Done** goes up by one.

Pull down from the top of tenant Home or My Jobs Today to reload. **Release to refresh** means the pull was far enough. **Refresh** does the same thing if the pull is awkward.
