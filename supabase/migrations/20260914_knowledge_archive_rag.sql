-- 완료된 캔버스 문서를 가볍게 보존하고 청크 단위로 검색하는 RAG 아카이브.
-- 1단계는 PostgreSQL FTS를 사용하며, 별도 벡터 DB 없이 운영할 수 있다.

CREATE TABLE IF NOT EXISTS public.knowledge_archive_documents (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('canvas', 'workspace_item')),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('doc', 'report', 'email', 'meeting_note', 'checklist', 'code')),
  content_text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_created_at TIMESTAMPTZ NOT NULL,
  source_updated_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  version BIGINT NOT NULL DEFAULT 1,
  chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  content_provider TEXT NOT NULL DEFAULT 'supabase'
    CHECK (content_provider IN ('supabase', 'google_drive')),
  drive_file_id TEXT,
  drive_url TEXT,
  privacy_scope TEXT NOT NULL DEFAULT 'cloud_private'
    CHECK (privacy_scope IN ('local_only', 'cloud_private', 'external_allowed')),
  ai_policy TEXT NOT NULL DEFAULT 'cloud_allowed'
    CHECK (ai_policy IN ('disabled', 'local_only', 'cloud_allowed')),
  keywords TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_document TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content_text, ''))
  ) STORED,
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, source_kind, source_id)
);

CREATE TABLE IF NOT EXISTS public.knowledge_archive_chunks (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  archive_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  content_text TEXT NOT NULL,
  char_start INTEGER NOT NULL CHECK (char_start >= 0),
  char_end INTEGER NOT NULL CHECK (char_end >= char_start),
  search_document TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(content_text, ''))
  ) STORED,
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, archive_id, ordinal),
  FOREIGN KEY (user_id, archive_id)
    REFERENCES public.knowledge_archive_documents(user_id, id) ON DELETE CASCADE
);

ALTER TABLE public.knowledge_archive_documents
  ADD COLUMN IF NOT EXISTS privacy_scope TEXT NOT NULL DEFAULT 'cloud_private'
    CHECK (privacy_scope IN ('local_only', 'cloud_private', 'external_allowed')),
  ADD COLUMN IF NOT EXISTS ai_policy TEXT NOT NULL DEFAULT 'cloud_allowed'
    CHECK (ai_policy IN ('disabled', 'local_only', 'cloud_allowed'));

CREATE INDEX IF NOT EXISTS knowledge_archive_documents_user_archived_idx
  ON public.knowledge_archive_documents (user_id, archived_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_archive_documents_search_idx
  ON public.knowledge_archive_documents USING GIN (search_document);
CREATE INDEX IF NOT EXISTS knowledge_archive_chunks_archive_idx
  ON public.knowledge_archive_chunks (user_id, archive_id, ordinal);
CREATE INDEX IF NOT EXISTS knowledge_archive_chunks_search_idx
  ON public.knowledge_archive_chunks USING GIN (search_document);

ALTER TABLE public.knowledge_archive_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_archive_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own archive documents" ON public.knowledge_archive_documents;
CREATE POLICY "Users can manage own archive documents" ON public.knowledge_archive_documents
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own archive chunks" ON public.knowledge_archive_chunks;
CREATE POLICY "Users can manage own archive chunks" ON public.knowledge_archive_chunks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.upsert_knowledge_archive(p_archive JSONB, p_chunks JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  target_archive_id TEXT := p_archive->>'id';
  saved_version BIGINT;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF target_archive_id IS NULL OR target_archive_id = '' OR p_archive->>'sourceKind' <> 'canvas' THEN
    RAISE EXCEPTION 'invalid archive payload';
  END IF;

  INSERT INTO public.knowledge_archive_documents (
    user_id, id, source_kind, source_id, title, doc_type, content_text,
    content_hash, source_created_at, source_updated_at, archived_at, version,
    chunk_count, content_provider, drive_file_id, drive_url,
    privacy_scope, ai_policy, keywords, metadata
  ) VALUES (
    current_user_id,
    target_archive_id,
    p_archive->>'sourceKind',
    p_archive->>'sourceId',
    p_archive->>'title',
    p_archive->>'docType',
    p_archive->>'content',
    p_archive->>'contentHash',
    (p_archive->>'createdAt')::TIMESTAMPTZ,
    (p_archive->>'updatedAt')::TIMESTAMPTZ,
    (p_archive->>'archivedAt')::TIMESTAMPTZ,
    GREATEST(COALESCE((p_archive->>'version')::BIGINT, 1), 1),
    jsonb_array_length(COALESCE(p_chunks, '[]'::jsonb)),
    COALESCE(p_archive->>'contentProvider', 'supabase'),
    p_archive->>'driveFileId',
    p_archive->>'driveUrl',
    'cloud_private',
    'cloud_allowed',
    ARRAY(
      SELECT keyword
      FROM jsonb_array_elements_text(COALESCE(p_archive->'keywords', '[]'::jsonb)) AS keyword
      LIMIT 40
    ),
    '{}'::jsonb
  )
  ON CONFLICT (user_id, id) DO UPDATE SET
    title = EXCLUDED.title,
    doc_type = EXCLUDED.doc_type,
    content_text = EXCLUDED.content_text,
    content_hash = EXCLUDED.content_hash,
    source_updated_at = EXCLUDED.source_updated_at,
    archived_at = EXCLUDED.archived_at,
    chunk_count = EXCLUDED.chunk_count,
    content_provider = EXCLUDED.content_provider,
    drive_file_id = EXCLUDED.drive_file_id,
    drive_url = EXCLUDED.drive_url,
    privacy_scope = EXCLUDED.privacy_scope,
    ai_policy = EXCLUDED.ai_policy,
    keywords = EXCLUDED.keywords,
    version = CASE
      WHEN public.knowledge_archive_documents.content_hash = EXCLUDED.content_hash
        THEN public.knowledge_archive_documents.version
      ELSE GREATEST(
        public.knowledge_archive_documents.version + 1,
        EXCLUDED.version
      )
    END
  RETURNING version INTO saved_version;

  DELETE FROM public.knowledge_archive_chunks
  WHERE user_id = current_user_id AND archive_id = target_archive_id;

  INSERT INTO public.knowledge_archive_chunks (
    user_id, id, archive_id, ordinal, content_text, char_start, char_end
  )
  SELECT
    current_user_id,
    chunk->>'id',
    target_archive_id,
    (chunk->>'ordinal')::INTEGER,
    chunk->>'content',
    (chunk->>'charStart')::INTEGER,
    (chunk->>'charEnd')::INTEGER
  FROM jsonb_array_elements(COALESCE(p_chunks, '[]'::jsonb)) AS chunk;

  RETURN jsonb_build_object('id', target_archive_id, 'version', saved_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.search_knowledge_archive(
  p_query TEXT,
  p_terms TEXT[] DEFAULT '{}'::TEXT[],
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  archive_id TEXT,
  source_kind TEXT,
  source_id TEXT,
  title TEXT,
  doc_type TEXT,
  content_hash TEXT,
  source_created_at TIMESTAMPTZ,
  source_updated_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  version BIGINT,
  chunk_count INTEGER,
  content_provider TEXT,
  drive_file_id TEXT,
  drive_url TEXT,
  privacy_scope TEXT,
  ai_policy TEXT,
  keywords TEXT[],
  excerpt TEXT,
  score REAL
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  expanded_query TSQUERY;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF trim(COALESCE(p_query, '')) = '' THEN
    RETURN QUERY
    SELECT
      document.id,
      document.source_kind,
      document.source_id,
      document.title,
      document.doc_type,
      document.content_hash,
      document.source_created_at,
      document.source_updated_at,
      document.archived_at,
      document.version,
      document.chunk_count,
      document.content_provider,
      document.drive_file_id,
      document.drive_url,
      document.privacy_scope,
      document.ai_policy,
      document.keywords,
      COALESCE(
        NULLIF(left(document.content_text, 300), ''),
        (
          SELECT left(first_chunk.content_text, 300)
          FROM public.knowledge_archive_chunks AS first_chunk
          WHERE first_chunk.user_id = document.user_id
            AND first_chunk.archive_id = document.id
          ORDER BY first_chunk.ordinal ASC
          LIMIT 1
        ),
        ''
      ),
      0::REAL
    FROM public.knowledge_archive_documents AS document
    WHERE document.user_id = auth.uid()
      AND document.ai_policy = 'cloud_allowed'
      AND document.privacy_scope <> 'local_only'
    ORDER BY document.archived_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
    RETURN;
  END IF;

  SELECT to_tsquery('simple', string_agg(term, ' | '))
  INTO expanded_query
  FROM (
    SELECT DISTINCT lower(raw_term) AS term
    FROM unnest(COALESCE(p_terms, '{}'::TEXT[])) AS raw_term
    WHERE raw_term ~ '^[[:alnum:]_가-힣]{2,80}$'
  ) AS safe_terms;
  IF expanded_query IS NULL THEN
    expanded_query := websearch_to_tsquery('simple', p_query);
  END IF;

  RETURN QUERY
  WITH search_query AS (
    SELECT expanded_query AS value
  ), ranked AS (
    SELECT
      document.id AS archive_id,
      document.source_kind,
      document.source_id,
      document.title,
      document.doc_type,
      document.content_hash,
      document.source_created_at,
      document.source_updated_at,
      document.archived_at,
      document.version,
      document.chunk_count,
      document.content_provider,
      document.drive_file_id,
      document.drive_url,
      document.privacy_scope,
      document.ai_policy,
      document.keywords,
      chunk.content_text AS excerpt,
      (ts_rank_cd(document.search_document, search_query.value) * 1.7
        + ts_rank_cd(chunk.search_document, search_query.value)
        + CASE WHEN document.keywords && COALESCE(p_terms, '{}'::TEXT[]) THEN 0.35 ELSE 0 END)::REAL AS score,
      row_number() OVER (
        PARTITION BY document.id
        ORDER BY
          ts_rank_cd(document.search_document, search_query.value) * 1.7
            + ts_rank_cd(chunk.search_document, search_query.value)
            + CASE WHEN document.keywords && COALESCE(p_terms, '{}'::TEXT[]) THEN 0.35 ELSE 0 END DESC,
          chunk.ordinal ASC
      ) AS result_order
    FROM public.knowledge_archive_documents AS document
    JOIN public.knowledge_archive_chunks AS chunk
      ON chunk.user_id = document.user_id AND chunk.archive_id = document.id
    CROSS JOIN search_query
    WHERE document.user_id = auth.uid()
      AND document.ai_policy = 'cloud_allowed'
      AND document.privacy_scope <> 'local_only'
      AND (
        document.search_document @@ search_query.value
        OR chunk.search_document @@ search_query.value
        OR document.keywords && COALESCE(p_terms, '{}'::TEXT[])
      )
  )
  SELECT
    ranked.archive_id,
    ranked.source_kind,
    ranked.source_id,
    ranked.title,
    ranked.doc_type,
    ranked.content_hash,
    ranked.source_created_at,
    ranked.source_updated_at,
    ranked.archived_at,
    ranked.version,
    ranked.chunk_count,
    ranked.content_provider,
    ranked.drive_file_id,
    ranked.drive_url,
    ranked.privacy_scope,
    ranked.ai_policy,
    ranked.keywords,
    left(ranked.excerpt, 300),
    ranked.score
  FROM ranked
  WHERE ranked.result_order = 1
  ORDER BY ranked.score DESC, ranked.archived_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_archive_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_archive_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_knowledge_archive(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_knowledge_archive(TEXT, TEXT[], INTEGER) TO authenticated;

-- 완료 상태가 되는 공통 문서도 자동으로 아카이브한다. 원본 업무 행은 그대로 유지한다.
CREATE OR REPLACE FUNCTION public.archive_completed_workspace_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_archive_id TEXT;
  archive_content TEXT;
  archive_hash TEXT;
  archive_doc_type TEXT;
  chunk_ordinal INTEGER := 0;
  chunk_start INTEGER := 1;
  chunk_end INTEGER;
BEGIN
  target_archive_id := 'archive:item:' || NEW.id;
  IF NEW.deleted_at IS NOT NULL
    OR NEW.status <> 'completed'
    OR NEW.item_type NOT IN ('note', 'meeting', 'document', 'briefing', 'reference')
    OR NEW.ai_policy <> 'cloud_allowed'
    OR NEW.privacy_scope = 'local_only' THEN
    DELETE FROM public.knowledge_archive_documents
    WHERE user_id = NEW.user_id AND id = target_archive_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'completed'
    AND OLD.title IS NOT DISTINCT FROM NEW.title
    AND OLD.content IS NOT DISTINCT FROM NEW.content
    AND OLD.raw_content IS NOT DISTINCT FROM NEW.raw_content
    AND OLD.work_note IS NOT DISTINCT FROM NEW.work_note
    AND OLD.item_type IS NOT DISTINCT FROM NEW.item_type
    AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at
    AND OLD.ai_policy IS NOT DISTINCT FROM NEW.ai_policy
    AND OLD.privacy_scope IS NOT DISTINCT FROM NEW.privacy_scope
    AND OLD.drive_url IS NOT DISTINCT FROM NEW.drive_url
    AND OLD.source IS NOT DISTINCT FROM NEW.source
    AND OLD.source_app IS NOT DISTINCT FROM NEW.source_app THEN
    RETURN NEW;
  END IF;

  archive_content := trim(concat_ws(E'\n\n',
    NULLIF(NEW.content, ''),
    NULLIF(NEW.raw_content, ''),
    NULLIF(NEW.work_note, '')
  ));
  IF archive_content = '' THEN archive_content := NEW.title; END IF;
  archive_hash := md5(NEW.title || E'\n' || archive_content);
  archive_doc_type := CASE NEW.item_type
    WHEN 'meeting' THEN 'meeting_note'
    WHEN 'briefing' THEN 'report'
    ELSE 'doc'
  END;

  INSERT INTO public.knowledge_archive_documents (
    user_id, id, source_kind, source_id, title, doc_type, content_text,
    content_hash, source_created_at, source_updated_at, archived_at, version,
    chunk_count, content_provider, drive_file_id, drive_url,
    privacy_scope, ai_policy, keywords, metadata
  ) VALUES (
    NEW.user_id,
    target_archive_id,
    'workspace_item',
    NEW.id,
    NEW.title,
    archive_doc_type,
    archive_content,
    archive_hash,
    NEW.created_at,
    COALESCE(NEW.updated_at, NEW.created_at),
    timezone('utc'::text, now()),
    GREATEST(COALESCE(NEW.version, 1), 1),
    CEIL(length(archive_content)::NUMERIC / 760)::INTEGER,
    'supabase',
    NULL,
    NEW.drive_url,
    NEW.privacy_scope,
    NEW.ai_policy,
    ARRAY(
      SELECT keyword
      FROM (
        SELECT DISTINCT lower(token) AS keyword
        FROM regexp_split_to_table(NEW.title || ' ' || archive_content, '[^[:alnum:]_가-힣]+') AS token
        WHERE length(token) >= 2
      ) AS extracted_keywords
      LIMIT 24
    ),
    jsonb_build_object('itemType', NEW.item_type, 'source', NEW.source, 'sourceApp', NEW.source_app)
  )
  ON CONFLICT (user_id, id) DO UPDATE SET
    title = EXCLUDED.title,
    doc_type = EXCLUDED.doc_type,
    content_text = EXCLUDED.content_text,
    content_hash = EXCLUDED.content_hash,
    source_updated_at = EXCLUDED.source_updated_at,
    archived_at = EXCLUDED.archived_at,
    chunk_count = EXCLUDED.chunk_count,
    content_provider = EXCLUDED.content_provider,
    drive_file_id = EXCLUDED.drive_file_id,
    drive_url = EXCLUDED.drive_url,
    privacy_scope = EXCLUDED.privacy_scope,
    ai_policy = EXCLUDED.ai_policy,
    keywords = EXCLUDED.keywords,
    metadata = EXCLUDED.metadata,
    version = CASE
      WHEN public.knowledge_archive_documents.content_hash = EXCLUDED.content_hash
        THEN public.knowledge_archive_documents.version
      ELSE GREATEST(public.knowledge_archive_documents.version + 1, EXCLUDED.version)
    END;

  DELETE FROM public.knowledge_archive_chunks
  WHERE user_id = NEW.user_id AND archive_id = target_archive_id;

  WHILE chunk_start <= length(archive_content) LOOP
    chunk_end := LEAST(length(archive_content), chunk_start + 899);
    INSERT INTO public.knowledge_archive_chunks (
      user_id, id, archive_id, ordinal, content_text, char_start, char_end
    ) VALUES (
      NEW.user_id,
      target_archive_id || ':' || chunk_ordinal,
      target_archive_id,
      chunk_ordinal,
      substr(archive_content, chunk_start, 900),
      chunk_start - 1,
      chunk_end
    );
    chunk_ordinal := chunk_ordinal + 1;
    chunk_start := chunk_start + 760;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS archive_completed_workspace_item_trigger ON public.unified_items;
CREATE TRIGGER archive_completed_workspace_item_trigger
  AFTER INSERT OR UPDATE ON public.unified_items
  FOR EACH ROW EXECUTE FUNCTION public.archive_completed_workspace_item();

-- 마이그레이션 이전에 이미 완료된 문서를 한 번 인덱싱한다.
WITH eligible AS (
  SELECT
    item.*,
    'archive:item:' || item.id AS archive_id,
    COALESCE(
      NULLIF(trim(concat_ws(E'\n\n',
        NULLIF(item.content, ''),
        NULLIF(item.raw_content, ''),
        NULLIF(item.work_note, '')
      )), ''),
      item.title
    ) AS archive_content,
    CASE item.item_type
      WHEN 'meeting' THEN 'meeting_note'
      WHEN 'briefing' THEN 'report'
      ELSE 'doc'
    END AS archive_doc_type
  FROM public.unified_items AS item
  WHERE item.deleted_at IS NULL
    AND item.status = 'completed'
    AND item.item_type IN ('note', 'meeting', 'document', 'briefing', 'reference')
    AND item.ai_policy = 'cloud_allowed'
    AND item.privacy_scope <> 'local_only'
)
INSERT INTO public.knowledge_archive_documents (
  user_id, id, source_kind, source_id, title, doc_type, content_text,
  content_hash, source_created_at, source_updated_at, archived_at, version,
  chunk_count, content_provider, drive_file_id, drive_url,
  privacy_scope, ai_policy, keywords, metadata
)
SELECT
  eligible.user_id,
  eligible.archive_id,
  'workspace_item',
  eligible.id,
  eligible.title,
  eligible.archive_doc_type,
  eligible.archive_content,
  md5(eligible.title || E'\n' || eligible.archive_content),
  eligible.created_at,
  COALESCE(eligible.updated_at, eligible.created_at),
  timezone('utc'::text, now()),
  GREATEST(COALESCE(eligible.version, 1), 1),
  CEIL(length(eligible.archive_content)::NUMERIC / 760)::INTEGER,
  'supabase',
  NULL,
  eligible.drive_url,
  eligible.privacy_scope,
  eligible.ai_policy,
  ARRAY(
    SELECT keyword
    FROM (
      SELECT DISTINCT lower(token) AS keyword
      FROM regexp_split_to_table(
        eligible.title || ' ' || eligible.archive_content,
        '[^[:alnum:]_가-힣]+'
      ) AS token
      WHERE length(token) >= 2
    ) AS extracted_keywords
    LIMIT 24
  ),
  jsonb_build_object(
    'itemType', eligible.item_type,
    'source', eligible.source,
    'sourceApp', eligible.source_app
  )
FROM eligible
ON CONFLICT (user_id, id) DO UPDATE SET
  title = EXCLUDED.title,
  doc_type = EXCLUDED.doc_type,
  content_text = EXCLUDED.content_text,
  content_hash = EXCLUDED.content_hash,
  source_updated_at = EXCLUDED.source_updated_at,
  archived_at = EXCLUDED.archived_at,
  chunk_count = EXCLUDED.chunk_count,
  content_provider = EXCLUDED.content_provider,
  drive_file_id = EXCLUDED.drive_file_id,
  drive_url = EXCLUDED.drive_url,
  privacy_scope = EXCLUDED.privacy_scope,
  ai_policy = EXCLUDED.ai_policy,
  keywords = EXCLUDED.keywords,
  metadata = EXCLUDED.metadata,
  version = CASE
    WHEN public.knowledge_archive_documents.content_hash = EXCLUDED.content_hash
      THEN public.knowledge_archive_documents.version
    ELSE GREATEST(public.knowledge_archive_documents.version + 1, EXCLUDED.version)
  END;

WITH eligible AS (
  SELECT user_id, 'archive:item:' || id AS archive_id
  FROM public.unified_items
  WHERE deleted_at IS NULL
    AND status = 'completed'
    AND item_type IN ('note', 'meeting', 'document', 'briefing', 'reference')
    AND ai_policy = 'cloud_allowed'
    AND privacy_scope <> 'local_only'
)
DELETE FROM public.knowledge_archive_chunks AS chunk
USING eligible
WHERE chunk.user_id = eligible.user_id
  AND chunk.archive_id = eligible.archive_id;

WITH eligible AS (
  SELECT
    item.user_id,
    'archive:item:' || item.id AS archive_id,
    COALESCE(
      NULLIF(trim(concat_ws(E'\n\n',
        NULLIF(item.content, ''),
        NULLIF(item.raw_content, ''),
        NULLIF(item.work_note, '')
      )), ''),
      item.title
    ) AS archive_content
  FROM public.unified_items AS item
  WHERE item.deleted_at IS NULL
    AND item.status = 'completed'
    AND item.item_type IN ('note', 'meeting', 'document', 'briefing', 'reference')
    AND item.ai_policy = 'cloud_allowed'
    AND item.privacy_scope <> 'local_only'
)
INSERT INTO public.knowledge_archive_chunks (
  user_id, id, archive_id, ordinal, content_text, char_start, char_end
)
SELECT
  eligible.user_id,
  eligible.archive_id || ':' || generated.ordinal,
  eligible.archive_id,
  generated.ordinal,
  substr(eligible.archive_content, generated.ordinal * 760 + 1, 900),
  generated.ordinal * 760,
  LEAST(length(eligible.archive_content), generated.ordinal * 760 + 900)
FROM eligible
CROSS JOIN LATERAL generate_series(
  0,
  CEIL(length(eligible.archive_content)::NUMERIC / 760)::INTEGER - 1
) AS generated(ordinal);
