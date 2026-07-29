-- Secure Exam Module Schema

-- Table for tracking secure exam sessions
CREATE TABLE public.exam_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL,
    exam_id UUID NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('in_progress', 'submitted', 'auto_submitted', 'violation_terminated')) DEFAULT 'in_progress',
    submitted_at TIMESTAMPTZ,
    score NUMERIC(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for tracking individual responses in real-time
CREATE TABLE public.exam_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    selected_answer JSONB,
    status TEXT NOT NULL CHECK (status IN ('not_visited', 'not_answered', 'answered', 'marked', 'answered_marked')) DEFAULT 'not_visited',
    time_spent_seconds INTEGER DEFAULT 0,
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, question_id)
);

-- Table for tracking cheating/violation events
CREATE TABLE public.exam_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('tab_hidden', 'window_blur', 'fullscreen_exit', 'devtools_suspected')),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role full access to exam_sessions" ON public.exam_sessions FOR ALL USING (true);
CREATE POLICY "Service Role full access to exam_responses" ON public.exam_responses FOR ALL USING (true);
CREATE POLICY "Service Role full access to exam_violations" ON public.exam_violations FOR ALL USING (true);
