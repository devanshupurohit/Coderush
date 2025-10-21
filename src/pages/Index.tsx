import { useState, useRef, useMemo, useEffect } from "react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Unlock, CheckCircle2, Code2, Trophy, Home, Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { login as backendLogin, signUp as backendSignUp } from "@/lib/auth";
import { verifyCode } from '../lib/verifyCode';
import { supabase } from "@/lib/supabase";
import { useLocation, useNavigate } from "react-router-dom";

type View = 'login' | 'signup' | 'home' | 'editor' | 'leaderboard';
type ProblemLevel = 'easy' | 'medium' | 'hard';

interface User {
  id: string;
  name: string;
  solved: {
    easy: boolean;
    medium: boolean;
    hard: boolean;
  };

  activeProblem: string | null;
}

interface LeaderboardEntry {
  rank: number;
  username: string;
  solved: number;
  totalTimeMs: number | null;
}

interface Problem {
  id: string;
  level: ProblemLevel;
  title: string;
  description: string;
}

const problems: Problem[] = [
  {
    id: 'reverseString',
    level: 'easy',
    title: 'Reverse String',
    description: 'Write a function that reverses a string. The input string is given as an array of characters. You must do this by modifying the input array in-place with O(1) extra memory.',
  },
  {
    id: 'findPairSum',
    level: 'medium',
    title: 'Find Pair Sum',
    description: 'Given an array of integers and a target sum, return indices of the two numbers such that they add up to the target. You may assume that each input would have exactly one solution, and you may not use the same element twice.',
  },
  {
    id: 'minCostPath',
    level: 'hard',
    title: 'Minimum Cost Path',
    description: 'Given a cost matrix and a position (m, n) in the matrix, find cost of minimum cost path to reach (m, n) from top left cell (0, 0). You can only traverse down, right and diagonally lower cells from a given cell.',
  },
];

//

const Index = () => {
  const [currentView, setCurrentView] = useState<View>('login');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('python');
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [editorStartTime, setEditorStartTime] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const timerRef = useRef<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const storageKey = 'coderush_user';
  const [isBootstrapped, setIsBootstrapped] = useState(false);

  // Load persisted user on first mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed: User = JSON.parse(raw);
        setCurrentUser(parsed);
      }
    } catch {
      // ignore
    }
    setIsBootstrapped(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist user whenever it changes
  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(storageKey, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // ignore
    }
  }, [currentUser]);

  // Route sync and guards
  useEffect(() => {
    if (!isBootstrapped) return;
    const path = location.pathname;
    const authed = !!currentUser;

    // Unauthed users must be on /login
    if (!authed && path !== '/login') {
      navigate('/login', { replace: true });
      setCurrentView('login');
      return;
    }
    // Authed users should not be on /login
    if (authed && path === '/login') {
      navigate('/', { replace: true });
      setCurrentView('home');
      return;
    }

    // Map paths to views/problems
    if (path === '/') {
      if (!authed) {
        navigate('/login', { replace: true });
        setCurrentView('login');
      } else {
        setCurrentView('home');
      }
      return;
    }
    if (path === '/leaderboard') {
      setCurrentView('leaderboard');
      return;
    }
    if (path === '/problem1') {
      if (authed) {
        setCurrentUser(prev => prev ? { ...prev, activeProblem: 'reverseString' } : prev);
        setCurrentView('editor');
      }
      return;
    }
    if (path === '/problem2') {
      if (authed && currentUser?.solved.easy) {
        setCurrentUser(prev => prev ? { ...prev, activeProblem: 'findPairSum' } : prev);
        setCurrentView('editor');
      } else if (authed) {
        navigate('/problem1', { replace: true });
      }
      return;
    }
    if (path === '/problem3') {
      if (authed && currentUser?.solved.medium) {
        setCurrentUser(prev => prev ? { ...prev, activeProblem: 'minCostPath' } : prev);
        setCurrentView('editor');
      } else if (authed) {
        navigate('/problem2', { replace: true });
      }
      return;
    }
  }, [location.pathname, currentUser, navigate, isBootstrapped]);

  // Fetch leaderboard from the view: public_leaderboard
  const fetchLeaderboard = async () => {
    try {
      setIsLeaderboardLoading(true);
      const { data, error } = await supabase
        .from('public_leaderboard')
        .select('id, username, email, time_easy_ms, time_medium_ms, time_hard_ms, total_time_ms');
      if (error) throw error;
      const mapped: LeaderboardEntry[] = (data ?? []).map((r: any, idx: number) => {
        const solved = [r.time_easy_ms, r.time_medium_ms, r.time_hard_ms].filter((v: any) => v != null).length;
        const displayName: string = (r.username ?? r.email ?? r.id ?? 'Anonymous') as string;
        return { rank: 0, username: displayName, solved, totalTimeMs: r.total_time_ms ?? null };
      });
      // Sort: solved desc, total time asc (nulls last), then username asc
      mapped.sort((a, b) => {
        if (b.solved !== a.solved) return b.solved - a.solved;
        const at = a.totalTimeMs; const bt = b.totalTimeMs;
        if (at == null && bt == null) return a.username.localeCompare(b.username);
        if (at == null) return 1;
        if (bt == null) return -1;
        if (at !== bt) return at - bt;
        return a.username.localeCompare(b.username);
      });
      mapped.forEach((m, i) => { m.rank = i + 1; });
      setLeaderboard(mapped);
    } catch (e) {
      console.error('Failed to fetch leaderboard', e);
      setLeaderboard([]);
    } finally {
      setIsLeaderboardLoading(false);
    }
  };

  // Load leaderboard when entering leaderboard view
  useEffect(() => {
    if (currentView === 'leaderboard') {
      fetchLeaderboard();
    }
  }, [currentView]);

  // Logout handler
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut?.();
    } catch {}
    setCurrentUser(null);
    setCurrentView('login');
    navigate('/login', { replace: true });
  };

  // Top Navbar with window (glass) effect
  const Navbar = () => (
    <div className="fixed top-0 left-0 right-0 z-40">
      <div className={"mx-auto max-w-7xl px-4 md:px-6"}>
        <div className="mt-3 rounded-xl border border-border bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/40 shadow-sm">
          <div className="flex items-center justify-between px-3 md:px-4 py-2">
            <div className="flex items-center gap-2 md:gap-3">
              <img src="/acm_light.png" alt="ACM" className="h-10 w-auto dark:hidden" />
              <img src="/acm_dark.png" alt="ACM" className="h-10 w-auto hidden dark:block" />
              <button
                type="button"
                onClick={() => navigate('/')}
                className="text-sm md:text-base font-semibold tracking-wide text-foreground focus:outline-none"
                aria-label="Go to Home"
                title="Home"
              >
                CodeRush
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => navigate('/leaderboard')}
                className="border-border p-2 w-9 h-9 flex items-center justify-center"
                aria-label="Leaderboard"
                title="Leaderboard"
              >
                <Trophy className="w-4 h-4" />
              </Button>
              <Button variant="outline" onClick={handleLogout} className="border-border">
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Spacer to push content below fixed Navbar
  const NavbarSpacer = () => (<div className="h-20" />);

  // Textarea ref for keyboard shortcuts
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  // Memoized computed values to avoid unnecessary recalculations
  const solvedCount = useMemo(() => (
    currentUser ? Object.values(currentUser.solved).filter(Boolean).length : 0
  ), [currentUser]);

  const totalProblems = useMemo(() => problems.length, []);

  const activeProblem = useMemo(() => (
    problems.find(p => p.id === currentUser?.activeProblem) ?? null
  ), [currentUser?.activeProblem]);

  // Start/stop editor timer when entering/leaving editor or changing problem
  useEffect(() => {
    if (currentView === 'editor' && activeProblem) {
      const start = Date.now();
      setEditorStartTime(start);
      setElapsedMs(0);
      // update every second
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - start);
      }, 1000) as unknown as number;
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    } else {
      // leaving editor
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setEditorStartTime(null);
      setElapsedMs(0);
    }
  }, [currentView, activeProblem?.id]);

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  // Save time for problem level to Supabase profiles and update total
  const saveProblemTime = async (userId: string, level: ProblemLevel, durationMs: number) => {
    try {
      // Fetch existing times
      const { data: existing, error: fetchErr } = await supabase
        .from('profiles')
        .select('time_easy_ms, time_medium_ms, time_hard_ms, total_time_ms')
        .eq('id', userId)
        .maybeSingle();
      if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr;

      const prevEasy: number | null = existing?.time_easy_ms ?? null;
      const prevMed: number | null = existing?.time_medium_ms ?? null;
      const prevHard: number | null = existing?.time_hard_ms ?? null;

      const next: { time_easy_ms: number | null; time_medium_ms: number | null; time_hard_ms: number | null } = {
        time_easy_ms: level === 'easy' ? durationMs : prevEasy,
        time_medium_ms: level === 'medium' ? durationMs : prevMed,
        time_hard_ms: level === 'hard' ? durationMs : prevHard,
      };
      const { error: upsertErr } = await supabase
        .from('profiles')
        .upsert({ id: userId, ...next });
      if (upsertErr) throw upsertErr;
    } catch (e) {
      // Swallow to not block UX; could surface via toast/log if desired
      console.error('Failed saving problem time', e);
    }
  };

  // Fetch profile times and update local solved flags so progress persists across sessions
  const syncSolvedFromProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('time_easy_ms, time_medium_ms, time_hard_ms')
        .eq('id', userId)
        .maybeSingle();
      if (error) return;
      setCurrentUser(prev => prev ? {
        ...prev,
        solved: {
          easy: data?.time_easy_ms != null,
          medium: data?.time_medium_ms != null,
          hard: data?.time_hard_ms != null,
        }
      } : prev);
    } catch {
      // ignore
    }
  };

  // When user logs in/changes, refresh progress from backend
  useEffect(() => {
    if (currentUser?.id) {
      syncSolvedFromProfile(currentUser.id);
    }
  }, [currentUser?.id]);

  // Handle common editor keyboard shortcuts
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = editorRef.current;
    if (!el) return;

    const value = el.value;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    const getLineStart = (pos: number) => value.lastIndexOf('\n', pos - 1) + 1;
    const getLineEnd = (pos: number) => {
      const i = value.indexOf('\n', pos);
      return i === -1 ? value.length : i;
    };

    // Toggle comment token based on selected language
    const commentToken = selectedLanguage === 'python' ? '#' : '//';

    // TAB and SHIFT+TAB for indent/outdent
    if (e.key === 'Tab') {
      e.preventDefault();
      const tab = '\t';
      const lineStart = getLineStart(start);
      const lineEnd = getLineEnd(end);
      const selected = value.slice(lineStart, lineEnd);

      if (start !== end && selected.includes('\n')) {
        // Multi-line indent/outdent
        const lines = selected.split('\n');
        if (e.shiftKey) {
          const newLines = lines.map((ln) => ln.startsWith('\t') ? ln.slice(1) : ln.startsWith('  ') ? ln.slice(2) : ln);
          const newSelected = newLines.join('\n');
          const newValue = value.slice(0, lineStart) + newSelected + value.slice(lineEnd);
          const removedPerLine = lines.reduce((acc, ln) => acc + (ln.startsWith('\t') ? 1 : ln.startsWith('  ') ? 2 : 0), 0);
          const newStart = start - (start > lineStart ? (value.slice(lineStart, start).startsWith('\t') ? 1 : value.slice(lineStart, start).startsWith('  ') ? 2 : 0) : 0);
          const newEnd = end - removedPerLine;
          setCode(newValue);
          requestAnimationFrame(() => {
            el.selectionStart = newStart;
            el.selectionEnd = newEnd;
          });
        } else {
          const newLines = lines.map((ln) => tab + ln);
          const newSelected = newLines.join('\n');
          const newValue = value.slice(0, lineStart) + newSelected + value.slice(lineEnd);
          const addedPerLine = lines.length;
          const newStart = start + (start === lineStart ? tab.length : tab.length);
          const newEnd = end + addedPerLine * tab.length;
          setCode(newValue);
          requestAnimationFrame(() => {
            el.selectionStart = newStart;
            el.selectionEnd = newEnd;
          });
        }
      } else {
        // Single-line or caret indent/outdent
        if (e.shiftKey) {
          // Outdent current line if prefixed
          const curLineStart = getLineStart(start);
          if (value.startsWith('\t', curLineStart)) {
            const newValue = value.slice(0, curLineStart) + value.slice(curLineStart + 1);
            setCode(newValue);
            requestAnimationFrame(() => {
              el.selectionStart = Math.max(curLineStart, start - 1);
              el.selectionEnd = Math.max(curLineStart, end - 1);
            });
          } else if (value.slice(curLineStart).startsWith('  ')) {
            const newValue = value.slice(0, curLineStart) + value.slice(curLineStart + 2);
            setCode(newValue);
            requestAnimationFrame(() => {
              el.selectionStart = Math.max(curLineStart, start - 2);
              el.selectionEnd = Math.max(curLineStart, end - 2);
            });
          }
        } else {
          const newValue = value.slice(0, start) + tab + value.slice(end);
          setCode(newValue);
          requestAnimationFrame(() => {
            const pos = start + tab.length;
            el.selectionStart = pos;
            el.selectionEnd = pos;
          });
        }
      }
      setIsVerified(false);
      return;
    }

    // ENTER auto-indent
    if (e.key === 'Enter') {
      const curLineStart = getLineStart(start);
      const curLine = value.slice(curLineStart, start);
      const indentMatch = curLine.match(/^[\t ]+/);
      const indent = indentMatch ? indentMatch[0] : '';
      e.preventDefault();
      const insertion = '\n' + indent;
      const newValue = value.slice(0, start) + insertion + value.slice(end);
      setCode(newValue);
      requestAnimationFrame(() => {
        const pos = start + insertion.length;
        el.selectionStart = pos;
        el.selectionEnd = pos;
      });
      setIsVerified(false);
      return;
    }

    // Toggle line/block comment: Ctrl+/ or Cmd+/
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const lineStart = getLineStart(start);
      const lineEnd = getLineEnd(end);
      const selected = value.slice(lineStart, lineEnd);
      const lines = selected.split('\n');
      const allCommented = lines.every((ln) => ln.trim().startsWith(commentToken));
      const newLines = lines.map((ln) => {
        const leadingWs = ln.match(/^\s*/)?.[0] ?? '';
        if (allCommented) {
          const trimmed = ln.slice(leadingWs.length);
          if (trimmed.startsWith(commentToken)) {
            const after = trimmed.slice(commentToken.length);
            return leadingWs + after.replace(/^\s?/, '');
          }
          return ln;
        } else {
          return leadingWs + commentToken + ' ' + ln.slice(leadingWs.length);
        }
      });
      const newSelected = newLines.join('\n');
      const newValue = value.slice(0, lineStart) + newSelected + value.slice(lineEnd);
      setCode(newValue);
      requestAnimationFrame(() => {
        el.selectionStart = lineStart;
        el.selectionEnd = lineStart + newSelected.length;
      });
      setIsVerified(false);
      return;
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !email.trim() || !password) return;
    setLoginError(null);
    setIsSubmitting(true);
    try {
      const user = await backendLogin({ username: username.trim(), email: email.trim(), password });
      setCurrentUser({
        id: user.id,
        name: user.name,
        solved: { easy: false, medium: false, hard: false },
        activeProblem: null,
      });
      setCurrentView('home');
      navigate('/', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setLoginError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async () => {
    if (!username.trim() || !email.trim() || !password) return;
    setSignupError(null);
    setIsSubmitting(true);
    try {
      const res = await backendSignUp({ username: username.trim(), email: email.trim(), password });
      if (res.requiresEmailVerification) {
        // Ask user to verify email and then log in
        setCurrentView('login');
        setLoginError('Check your email to verify your account, then sign in.');
      } else if (res.userId) {
        setCurrentUser({
          id: res.userId,
          name: username.trim(),
          solved: { easy: false, medium: false, hard: false },
          activeProblem: null,
        });
        setCurrentView('home');
        navigate('/', { replace: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      setSignupError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProblemSelect = (problemId: string) => {
    if (currentUser) {
      setCurrentUser({ ...currentUser, activeProblem: problemId });
      setCurrentView('editor');
      setCode('');
      const prob = problems.find(p => p.id === problemId);
      if (prob?.level === 'easy') navigate('/problem1');
      if (prob?.level === 'medium') navigate('/problem2');
      if (prob?.level === 'hard') navigate('/problem3');
    }
  };

  const handleVerifyCode = async () => {
    setCodeError(null);
    setIsVerified(false);
    if (!currentUser || !currentUser.activeProblem) {
      setCodeError('No active problem selected.');
      return;
    }
    setIsVerifying(true);
    try {
      const currentProblem = problems.find(p => p.id === currentUser.activeProblem);
      if (!currentProblem) {
        setCodeError('Problem not found.');
        setIsVerifying(false);
        return;
      }
      const isCorrect = await verifyCode(code, currentProblem.description, selectedLanguage);
      if (isCorrect) {
        setIsVerified(true);
        setCodeError(null);
      } else {
        setIsVerified(false);
        setCodeError('Code incorrect. Please fix before submitting.');
      }
    } catch (err) {
      setIsVerified(false);
      setCodeError('Verification failed. Please try again.');
    }
    setIsVerifying(false);
  };

  const handleSubmitCode = async () => {
    setCodeError(null);
    if (!currentUser || !currentUser.activeProblem) {
      setCodeError('No active problem selected.');
      return;
    }
    if (!isVerified) {
      setCodeError('Please verify your code before submitting.');
      return;
    }
    setIsSubmitting(true);
    try {
      const currentProblem = problems.find(p => p.id === currentUser.activeProblem);
      if (!currentProblem) {
        setCodeError('Problem not found.');
        setIsSubmitting(false);
        return;
      }
      // Mark problem as solved
      setCurrentUser(prev => prev ? {
        ...prev,
        solved: {
          ...prev.solved,
          [currentProblem.level]: true
        }
      } : prev);
      // Persist timing to Supabase
      const duration = editorStartTime ? (Date.now() - editorStartTime) : elapsedMs;
      if (currentUser?.id) {
        await saveProblemTime(currentUser.id, currentProblem.level, duration);
      }
      setCodeError(null);
      alert('Code submitted!');
      setCurrentView('home');
      navigate('/', { replace: true });
      setIsVerified(false);
    } catch (err) {
      setCodeError('Submission failed. Please try again.');
    }
    setIsSubmitting(false);
  };

  const isProblemUnlocked = (level: ProblemLevel): boolean => {
    if (!currentUser) return false;
    if (level === 'easy') return true;
    if (level === 'medium') return currentUser.solved.easy;
    if (level === 'hard') return currentUser.solved.medium;
    return false;
  };

  const isProblemSolved = (level: ProblemLevel): boolean => {
    return currentUser?.solved[level] || false;
  };

  const getProblemStatusIcon = (level: ProblemLevel) => {
    if (isProblemSolved(level)) {
      return <CheckCircle2 className="w-5 h-5 text-accent" />;
    }
    if (isProblemUnlocked(level)) {
      return <Unlock className="w-5 h-5 text-primary" />;
    }
    return <Lock className="w-5 h-5 text-muted-foreground" />;
  };

  const getDifficultyColor = (level: ProblemLevel) => {
    switch (level) {
      case 'easy': return 'text-accent';
      case 'medium': return 'text-yellow-400';
      case 'hard': return 'text-destructive';
      default: return 'text-foreground';
    }
  };

  // Login View
  if (currentView === 'login') {
    return (
      <div className="min-h-screen bg-background relative flex flex-col">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        {/* Header section */}
        <div className="px-4 md:px-8 pt-12 md:pt-20 pb-6">
          <div className="max-w-5xl mx-auto text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center shadow-glow">
                <Code2 className="w-10 h-10 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              CodeRush
            </h1>
            <p className="text-muted-foreground text-base md:text-lg">
              Enter your credentials to start competing
            </p>
          </div>
        </div>
        {/* Centered form section */}
        <div className="flex-1 flex items-center">
          <div className="w-full px-4 md:px-8">
            <div className="max-w-md mx-auto space-y-4">
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium text-foreground">Username</label>
                <Input id="username" type="text" placeholder="Enter your username" value={username} onChange={(e) => setUsername(e.target.value)} className="bg-background border-border focus:border-primary focus:ring-primary transition-smooth" />
              </div>
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-foreground">Email</label>
                <Input id="email" type="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-background border-border focus:border-primary focus:ring-primary transition-smooth" />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
                <div className="relative">
                  <Input id="password" type={showLoginPassword ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && !isSubmitting && handleLogin()} className="bg-background border-border focus:border-primary focus:ring-primary transition-smooth pr-10" />
                  <button type="button" aria-label={showLoginPassword ? 'Hide password' : 'Show password'} onClick={() => setShowLoginPassword(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md hover:bg-muted transition-smooth text-muted-foreground focus:outline-none">
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {loginError && (
                <div className="space-y-2">
                  <p className="text-sm text-destructive">{loginError}</p>
                  <Button variant="outline" onClick={() => setCurrentView('signup')} className="w-full border-border">Create an account</Button>
                </div>
              )}
              <Button onClick={handleLogin} disabled={!username.trim() || !email.trim() || !password || isSubmitting} className="w-full gradient-primary hover:opacity-90 transition-smooth shadow-glow font-semibold">
                {isSubmitting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in...</>) : ('Start Competing')}
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                Don't have an account?{' '}
                <button onClick={() => setCurrentView('signup')} className="underline">Sign up</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Signup View
  if (currentView === 'signup') {
    return (
      <div className="min-h-screen bg-background relative flex flex-col">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        {/* Header section */}
        <div className="px-4 md:px-8 pt-12 md:pt-20 pb-6">
          <div className="max-w-5xl mx-auto text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center shadow-glow">
                <Code2 className="w-10 h-10 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Create your account
            </h1>
            <p className="text-muted-foreground text-base md:text-lg">
              Sign up with your email, password, and username
            </p>
          </div>
        </div>
        {/* Centered form section */}
        <div className="flex-1 flex items-center">
          <div className="w-full px-4 md:px-8">
            <div className="max-w-md mx-auto space-y-4">
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium text-foreground">Username</label>
                <Input id="username" type="text" placeholder="Choose a username" value={username} onChange={(e) => setUsername(e.target.value)} className="bg-background border-border focus:border-primary focus:ring-primary transition-smooth" />
              </div>
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-foreground">Email</label>
                <Input id="email" type="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-background border-border focus:border-primary focus:ring-primary transition-smooth" />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
                <div className="relative">
                  <Input id="password" type={showSignupPassword ? 'text' : 'password'} placeholder="Create a password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && !isSubmitting && handleSignup()} className="bg-background border-border focus:border-primary focus:ring-primary transition-smooth pr-10" />
                  <button type="button" aria-label={showSignupPassword ? 'Hide password' : 'Show password'} onClick={() => setShowSignupPassword(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md hover:bg-muted transition-smooth text-muted-foreground focus:outline-none">
                    {showSignupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {signupError && (<p className="text-sm text-destructive">{signupError}</p>)}
              <Button onClick={handleSignup} disabled={!username.trim() || !email.trim() || !password || isSubmitting} className="w-full gradient-primary hover:opacity-90 transition-smooth shadow-glow font-semibold">
                {isSubmitting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating account...</>) : ('Sign up')}
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}<button onClick={() => setCurrentView('login')} className="underline">Sign in</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Home View
  if (currentView === 'home') {
    const solvedCount = currentUser ? Object.values(currentUser.solved).filter(Boolean).length : 0;
    const totalProblems = problems.length;
    
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <NavbarSpacer />
        {/* Theme Toggle */}
        <div className="fixed top-4 right-4 z-50">
          <ThemeToggle />
        </div>
        
        {/* Hero Section with Animated Background */}
        <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-secondary/10 border-b border-border">
          <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
          <div className="absolute top-10 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-10 left-10 w-96 h-96 bg-secondary/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          
          <div className="relative max-w-6xl mx-auto px-4 md:px-8 py-12 md:py-16">
            <div className="text-center space-y-6 animate-fade-in">
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary rounded-full blur-xl opacity-50 animate-pulse"></div>
                  <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full gradient-primary flex items-center justify-center shadow-glow">
                    <Code2 className="w-10 h-10 md:w-12 md:h-12 text-primary-foreground animate-scale-in" />
                  </div>
                </div>
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent animate-fade-in">
                Welcome, {currentUser?.name}!
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto animate-fade-in" style={{ animationDelay: '0.1s' }}>
                Challenge yourself with algorithmic problems and climb the leaderboard
              </p>

              {/* Progress Stats */}
              <div className="flex flex-wrap justify-center gap-4 md:gap-8 mt-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
                <div className="flex flex-col items-center p-4 md:p-6 rounded-lg bg-card/50 backdrop-blur-sm border border-border shadow-card hover-scale">
                  <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    {solvedCount}
                  </div>
                  <div className="text-xs md:text-sm text-muted-foreground mt-1">Problems Solved</div>
                </div>
                
                <div className="flex flex-col items-center p-4 md:p-6 rounded-lg bg-card/50 backdrop-blur-sm border border-border shadow-card hover-scale">
                  <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    {Math.round((solvedCount / totalProblems) * 100)}%
                  </div>
                  <div className="text-xs md:text-sm text-muted-foreground mt-1">Completion Rate</div>
                </div>
                
                <div className="flex flex-col items-center p-4 md:p-6 rounded-lg bg-card/50 backdrop-blur-sm border border-border shadow-card hover-scale">
                  <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    {totalProblems - solvedCount}
                  </div>
                  <div className="text-xs md:text-sm text-muted-foreground mt-1">Remaining</div>
                </div>
              </div>

              <div className="pt-4">
                <Button
                  onClick={() => navigate('/leaderboard')}
                  className="gradient-primary hover:opacity-90 transition-smooth shadow-glow font-semibold hover-scale"
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  View Leaderboard
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Problem Cards Section */}
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-12">
          <div className="mb-8 animate-fade-in">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              Available Challenges
            </h2>
            <p className="text-muted-foreground">
              Solve problems to unlock the next challenge
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {problems.map((problem, index) => {
              const isUnlocked = isProblemUnlocked(problem.level);
              const isSolved = isProblemSolved(problem.level);

              return (
                <div
                  key={problem.id}
                  className="animate-fade-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <Card
                    className={`h-full gradient-card shadow-card border-border transition-all duration-300 ${
                      isUnlocked
                        ? 'hover:shadow-glow cursor-pointer hover:scale-105 hover:-translate-y-1'
                        : 'opacity-60 cursor-not-allowed'
                    } ${isSolved ? 'border-accent' : ''}`}
                    onClick={() => isUnlocked && handleProblemSelect(problem.id)}
                  >
                    <CardHeader className="space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-3">
                            <div className={`transition-transform duration-300 ${isSolved ? 'animate-scale-in' : ''}`}>
                              {getProblemStatusIcon(problem.level)}
                            </div>
                            <span className={`text-xs font-semibold uppercase px-2 py-1 rounded ${getDifficultyColor(problem.level)} bg-background/50`}>
                              {problem.level}
                            </span>
                          </div>
                          <CardTitle className="text-xl text-foreground">
                            {isUnlocked ? problem.title : null}
                          </CardTitle>
                        </div>
                        <div className={`ml-2 p-2 rounded-lg ${isUnlocked ? 'bg-primary/10' : 'bg-muted'}`}>
                          <Code2 className={`w-5 h-5 ${isUnlocked ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                      </div>
                      <CardDescription className="text-muted-foreground line-clamp-3">
                        {isUnlocked ? problem.description : 'Complete the previous challenge to unlock this problem.'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        <span className={`text-sm font-medium ${
                          isSolved ? 'text-accent' : isUnlocked ? 'text-primary' : 'text-muted-foreground'
                        }`}>
                          {isSolved ? '✓ Solved' : isUnlocked ? 'Start Challenge →' : '🔒 Locked'}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
          
          {/* Motivational Section */}
          {solvedCount > 0 && (
            <div className="mt-12 text-center animate-fade-in">
              <div className="inline-block p-6 md:p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-border">
                <div className="text-4xl mb-3">🎯</div>
                <h3 className="text-xl md:text-2xl font-bold text-foreground mb-2">
                  Great Progress!
                </h3>
                <p className="text-muted-foreground max-w-md">
                  {solvedCount === totalProblems 
                    ? "Congratulations! You've completed all challenges!" 
                    : `Keep going! Only ${totalProblems - solvedCount} challenge${totalProblems - solvedCount > 1 ? 's' : ''} remaining.`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Editor View
  if (currentView === 'editor') {
    const activeProblem = problems.find(p => p.id === currentUser?.activeProblem);
    if (!activeProblem) {
      navigate('/');
      return null;
    }
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
 
        {/* Theme Toggle */}
        <div className="fixed top-4 right-4 z-50">
          <ThemeToggle />
        </div>
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Button
              onClick={() => {
                if (currentUser) {
                  setCurrentUser({ ...currentUser, activeProblem: null });
                }
                setIsVerified(false);
                navigate('/');
              }}
              variant="outline"
              className="transition-smooth"
            >
              <Home className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold uppercase ${getDifficultyColor(activeProblem.level)}`}>
                {activeProblem.level}
              </span>
            </div>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Problem Description */}
            <Card className="gradient-card shadow-card border-border">
              <CardHeader>
                <CardTitle className="text-2xl text-foreground">
                  {activeProblem.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  {activeProblem.description}
                </p>
              </CardContent>
            </Card>
            {/* Code Editor */}
            <Card className="gradient-card shadow-card border-border">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <CardTitle className="text-xl text-foreground">Code Editor</CardTitle>
                  <div className="flex items-center gap-3">
                    <div className="px-2 py-1 rounded-md bg-muted text-foreground text-xs font-mono">
                      {formatDuration(elapsedMs)}
                    </div>
                    <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                      <SelectTrigger className="w-full sm:w-[180px] bg-background border-border">
                        <SelectValue placeholder="Language" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border z-50">
                        <SelectItem value="python">Python</SelectItem>
                        <SelectItem value="java">Java</SelectItem>
                        <SelectItem value="cpp">C++</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <textarea
                  ref={editorRef}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setIsVerified(false);
                  }}
                  onKeyDown={handleEditorKeyDown}
                  placeholder={`// Write your ${selectedLanguage} code here...\n\n`}
                  className="w-full h-64 md:h-96 p-4 bg-background border border-border rounded-lg font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none transition-smooth"
                />
                {codeError && (
                  <p className="text-sm text-destructive">{codeError}</p>
                )}
                <div className="flex flex-col md:flex-row gap-4">
                  <Button
                    onClick={handleVerifyCode}
                    disabled={isVerifying || !code.trim()}
                    variant="outline"
                    className={`w-full md:w-1/2 transition-smooth font-semibold ${isVerified ? 'opacity-70' : ''}`}
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : isVerified ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Verified!
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        Verify Code
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleSubmitCode}
                    disabled={isSubmitting || !code.trim() || !isVerified}
                    className={`w-full md:w-1/2 gradient-primary text-white transition-smooth shadow-glow font-semibold ${!isVerified ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Code'
                    )}
                  </Button>
                </div>
                {isVerified && !codeError && (
                  <p className="text-sm text-green-600">Code verified! You can now submit.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Leaderboard View
  if (currentView === 'leaderboard') {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <Navbar />
        <NavbarSpacer />
        <div className="fixed top-4 right-4 z-50">
          <ThemeToggle />
        </div>
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Leaderboard</h1>
            <Button onClick={() => navigate('/')} variant="outline" className="transition-smooth">
              <Home className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </div>
          <Card className="gradient-card shadow-card border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-border">
                    <tr className="bg-muted/50">
                      <th className="px-4 md:px-6 py-4 text-left text-sm font-semibold text-foreground">Rank</th>
                      <th className="px-4 md:px-6 py-4 text-left text-sm font-semibold text-foreground">Username</th>
                      <th className="px-4 md:px-6 py-4 text-center text-sm font-semibold text-foreground">Solved</th>
                      <th className="px-4 md:px-6 py-4 text-right text-sm font-semibold text-foreground">Total Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLeaderboardLoading && (
                      <tr>
                        <td className="px-4 md:px-6 py-6 text-muted-foreground" colSpan={4}>Loading leaderboard…</td>
                      </tr>
                    )}
                    {!isLeaderboardLoading && leaderboard.length === 0 && (
                      <tr>
                        <td className="px-4 md:px-6 py-6 text-muted-foreground" colSpan={4}>No data yet</td>
                      </tr>
                    )}
                    {!isLeaderboardLoading && leaderboard.map((entry, index) => (
                      <tr key={entry.rank} className={`border-b border-border transition-smooth hover:bg-muted/30 ${index === 0 ? 'bg-primary/10' : ''}`}>
                        <td className="px-4 md:px-6 py-4">
                          <div className="flex items-center gap-2">
                            {entry.rank === 1 && (<Trophy className="w-5 h-5 text-yellow-400" />)}
                            {entry.rank === 2 && (<Trophy className="w-5 h-5 text-gray-400" />)}
                            {entry.rank === 3 && (<Trophy className="w-5 h-5 text-amber-600" />)}
                            {entry.rank > 3 && (<span className="font-bold text-foreground">#{entry.rank}</span>)}
                          </div>
                        </td>
                        <td className="px-4 md:px-6 py-4 text-foreground font-medium">{entry.username}</td>
                        <td className="px-4 md:px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-accent/20 text-accent font-semibold text-sm">{entry.solved}</span>
                        </td>
                        <td className="px-4 md:px-6 py-4 text-right text-foreground">{entry.totalTimeMs == null ? '-' : formatDuration(entry.totalTimeMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return null;
};

export default Index;
