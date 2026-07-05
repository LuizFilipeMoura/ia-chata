import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
  type MutableRefObject,
} from "react";

export interface ChatMessage {
  id: number;
  role: "user" | "bot";
  text: string;
  pending?: boolean;
  thinking?: string;
  showThink?: boolean;
  thinkOpen?: boolean;
  /** Plain seed/greeting/clear/error bot bubble: render as text with glossary
   * highlighting rather than the streamed markdown/think structure. */
  plain?: boolean;
}

export interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

interface ChatApi {
  messages: ChatMessage[];
  history: MutableRefObject<HistoryEntry[]>;
  isStreaming: boolean;
  status: string;
  think: boolean;
  addMessage: (msg: Omit<ChatMessage, "id"> & { id?: number }) => number;
  updateMessage: (id: number, patch: Partial<ChatMessage>) => void;
  setStreaming: (v: boolean) => void;
  setStatus: (s: string) => void;
  pushHistory: (entry: HistoryEntry) => void;
  clear: () => void;
  setThink: (v: boolean) => void;
}

const Ctx = createContext<ChatApi | null>(null);

let nextId = 1;

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setStreaming] = useState(false);
  const [status, setStatus] = useState("");
  const [think, setThink] = useState(true);
  const history = useRef<HistoryEntry[]>([]);

  const addMessage = useCallback((msg: Omit<ChatMessage, "id"> & { id?: number }) => {
    const id = msg.id ?? nextId++;
    setMessages((prev) => [...prev, { ...msg, id }]);
    return id;
  }, []);

  const updateMessage = useCallback((id: number, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const pushHistory = useCallback((entry: HistoryEntry) => {
    history.current.push(entry);
  }, []);

  const clear = useCallback(() => {
    history.current = [];
    setMessages([]);
  }, []);

  const value = useMemo(
    () => ({
      messages,
      history,
      isStreaming,
      status,
      think,
      addMessage,
      updateMessage,
      setStreaming,
      setStatus,
      pushHistory,
      clear,
      setThink,
    }),
    [
      messages,
      history,
      isStreaming,
      status,
      think,
      addMessage,
      updateMessage,
      setStreaming,
      setStatus,
      pushHistory,
      clear,
      setThink,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}

export function useChat(): ChatApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useChat outside ChatProvider");
  return v;
}
