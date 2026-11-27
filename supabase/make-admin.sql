-- Make someone an admin (they must have signed up first). Change the email and run in SQL Editor.
update public.profiles set role = 'admin' where email = 'name@codetantra.in';
