import React, { useState, useEffect } from 'react';
import { BookOpen, CheckCircle, Clock } from 'lucide-react';
import { apiClient } from '../../api/client';

const TestLibrary = () => {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      try { const data = await apiClient.get('/tests'); setTests(data || []); }
      catch { }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const filtered = filter === 'all' ? tests : tests.filter(t => t.status === filter);

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Test Library</h1>
          <p>Overview of all tests across the platform — drafted and published.</p>
        </div>
      </div>

      <div className="admin-tabs">
        {[['all', 'All Tests'], ['draft', 'Drafts'], ['published', 'Published']].map(([val, label]) => (
          <button key={val} className={`admin-tab ${filter === val ? 'active' : ''}`} onClick={() => setFilter(val)}>{label}</button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="admin-empty"><BookOpen size={40} /><p>No tests found.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(t => (
            <div key={t.id} className="admin-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: t.status === 'published' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <BookOpen size={18} color={t.status === 'published' ? '#059669' : '#d97706'} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 3 }}>{t.title}</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {t.subject && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.subject}</span>}
                    {t.duration_minutes && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.duration_minutes} min</span>}
                    {t.created_at && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Created {new Date(t.created_at).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className={`admin-badge admin-badge-${t.status === 'published' ? 'published' : 'draft'}`}>
                  {t.status === 'published'
                    ? <><CheckCircle size={10} /> Published</>
                    : <><Clock size={10} /> Draft</>
                  }
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {t.question_count ?? (t.test_questions?.length ?? 0)} Q
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TestLibrary;
