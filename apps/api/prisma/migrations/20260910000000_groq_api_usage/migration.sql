CREATE TABLE "groq_api_usage" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model" VARCHAR(100) NOT NULL,
    "outcome" VARCHAR(30) NOT NULL,
    "http_status" INTEGER,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "total_tokens" INTEGER,
    "duration_ms" INTEGER NOT NULL,
    CONSTRAINT "groq_api_usage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "groq_usage_nonnegative" CHECK (
      "duration_ms" >= 0 AND "prompt_tokens" >= 0 AND "completion_tokens" >= 0 AND "total_tokens" >= 0
    )
);
CREATE INDEX "groq_api_usage_created_at_idx" ON "groq_api_usage"("created_at" DESC);
