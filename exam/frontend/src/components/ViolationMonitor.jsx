import React, { useEffect, useRef } from 'react';
import { apiClient } from '../api/client';

const ViolationMonitor = ({ sessionId, onViolationLimitReached, onViolationWarning }) => {
  const localStrikeCount = useRef(0);
  // Store callbacks in refs so the useEffect never re-registers DOM listeners
  const onLimitRef = useRef(onViolationLimitReached);
  const onWarningRef = useRef(onViolationWarning);

  useEffect(() => { onLimitRef.current = onViolationLimitReached; }, [onViolationLimitReached]);
  useEffect(() => { onWarningRef.current = onViolationWarning; }, [onViolationWarning]);

  useEffect(() => {
    /** Counts the strike in this tab. Used whenever the server cannot count it. */
    const strikeLocally = (type) => {
      localStrikeCount.current += 1;
      if (localStrikeCount.current >= 3) onLimitRef.current();
      else onWarningRef.current(type);
    };

    const logViolation = async (type) => {
      // Offline demo paper — there is no attempt to record against.
      if (sessionId?.startsWith('mock-session')) return strikeLocally(type);

      // Violations hang off the attempt the portal created. This used to post to
      // `/exam/session/:id/violation`, which lives on the standalone exam service
      // on port 3001 and is keyed on a table this flow never writes to — so every
      // strike 404'd and proctoring silently did nothing.
      try {
        const res = await apiClient.post(`/attempts/${sessionId}/violation`, { type });

        // `degraded` means the server has nowhere to store strikes yet (migration
        // 005 not applied). Proctoring still works, just per-tab.
        if (res.degraded) return strikeLocally(type);

        if (res.terminated) onLimitRef.current();
        else onWarningRef.current(type);
      } catch (err) {
        console.error('Failed to log violation', err);
        // The server is the source of truth for the strike count, but a network
        // blip must not hand out free violations either.
        strikeLocally(type);
      }
    };

    // Bug #1 fix: Only use visibilitychange (not blur). 
    // blur fires for benign actions (clicking URL bar, OS notifications) AND fires
    // simultaneously with visibilitychange on tab switch, causing double-strikes.
    const handleVisibilityChange = () => {
      if (document.hidden) logViolation('tab_hidden');
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) logViolation('fullscreen_exit');
    };

    const blockShortcutsAndContext = (e) => {
      if (e.type === 'contextmenu') e.preventDefault();
      if (['copy', 'cut', 'paste', 'dragstart'].includes(e.type)) e.preventDefault();
      if (e.type === 'keydown') {
        // Block F12, Ctrl+Shift+I/J/C, Ctrl+U/P/S
        if (e.key === 'F12' || 
            (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
            (e.ctrlKey && (e.key === 'U' || e.key === 'P' || e.key === 'S'))) {
          e.preventDefault();
        }
        // Block Alt+Tab awareness (we can't prevent it, but we detect it via visibilitychange)
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    ['copy', 'cut', 'paste', 'contextmenu', 'dragstart', 'keydown'].forEach(evt => 
      document.addEventListener(evt, blockShortcutsAndContext)
    );

    // Bug #2 fix: Only depend on sessionId (stable string). 
    // Callbacks are accessed via refs so they're always current.
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      ['copy', 'cut', 'paste', 'contextmenu', 'dragstart', 'keydown'].forEach(evt => 
        document.removeEventListener(evt, blockShortcutsAndContext)
      );
    };
  }, [sessionId]); // Only re-register if sessionId changes

  return null;
};

export default ViolationMonitor;
