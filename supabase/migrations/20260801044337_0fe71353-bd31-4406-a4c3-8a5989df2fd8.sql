
DROP POLICY IF EXISTS "crm_campaign_media_public_read" ON storage.objects;
DROP POLICY IF EXISTS "crm_campaign_media_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "crm_campaign_media_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "crm_campaign_media_owner_delete" ON storage.objects;

CREATE POLICY "crm_campaign_media_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'crm-campaign-media');

CREATE POLICY "crm_campaign_media_owner_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'crm-campaign-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "crm_campaign_media_owner_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'crm-campaign-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'crm-campaign-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "crm_campaign_media_owner_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'crm-campaign-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
