-- PUBLIC includes anon/authenticated unless explicitly revoked.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
