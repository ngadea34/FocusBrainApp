/**
 * Configuration publique du projet Supabase de développement.
 * La clé « publishable » est faite pour être embarquée dans une application :
 * elle ne donne que les droits de l'utilisateur connecté, bornés par la RLS.
 * Aucun secret ici (règle du projet) : la clé secrète reste côté worker.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://nejqievnldeqiasqsdlj.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? "sb_publishable_YwbwbyG1W8ni-uBXD6vNSA_IndMRhKj";

/** Durée de validité des liens d'écoute (secondes). */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;
