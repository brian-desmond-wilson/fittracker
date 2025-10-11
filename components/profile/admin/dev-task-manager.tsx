"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleDot,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import {
  DevTask,
  DevTaskPriority,
  DevTaskSection,
  DevTaskStatus,
} from "@/types/dev-task";

type SectionOption = "all" | DevTaskSection;
type StatusOption = "all" | DevTaskStatus | "active";
type PriorityOption = "all" | DevTaskPriority;
type SortOption =
  | "created_desc"
  | "created_asc"
  | "priority_desc"
  | "priority_asc"
  | "section"
  | "status"
  | "completed_desc"
  | "completed_asc";

interface DevTaskManagerProps {
  initialTasks: DevTask[];
}

const SECTION_OPTIONS: { value: SectionOption; label: string }[] = [
  { value: "all", label: "All sections" },
  { value: "home", label: "Home" },
  { value: "schedule", label: "Schedule" },
  { value: "track", label: "Track" },
  { value: "progress", label: "Progress" },
  { value: "profile", label: "Profile" },
  { value: "settings", label: "Settings" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS: { value: StatusOption; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active (Open & In Progress)" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Completed" },
];

const PRIORITY_OPTIONS: { value: PriorityOption; label: string }[] = [
  { value: "all", label: "All priorities" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
  { value: "priority_desc", label: "Priority (High → Low)" },
  { value: "priority_asc", label: "Priority (Low → High)" },
  { value: "section", label: "Section (A → Z)" },
  { value: "status", label: "Status (A → Z)" },
  { value: "completed_desc", label: "Recently completed" },
  { value: "completed_asc", label: "Oldest completed" },
];

const PRIORITY_COLORS: Record<DevTaskPriority, string> = {
  high: "text-red-400 bg-red-400/10 border-red-400/30",
  medium: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  low: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
};

const STATUS_LABELS: Record<DevTaskStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Completed",
};

export function DevTaskManager({ initialTasks }: DevTaskManagerProps) {
  const [tasks, setTasks] = useState<DevTask[]>(initialTasks);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState<SectionOption>("all");
  const [statusFilter, setStatusFilter] = useState<StatusOption>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityOption>("all");
  const [sortOption, setSortOption] = useState<SortOption>("created_desc");
  const [showCompleted, setShowCompleted] = useState(true);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(true);
  const [newTask, setNewTask] = useState({
    section: "schedule" as DevTaskSection,
    title: "",
    description: "",
    priority: "medium" as DevTaskPriority,
    status: "open" as DevTaskStatus,
  });

  useEffect(() => {
    const handler = window.setTimeout(() => setDebouncedSearch(searchTerm), 350);
    return () => window.clearTimeout(handler);
  }, [searchTerm]);

  const fetchTasks = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();

        if (debouncedSearch) {
          params.set("q", debouncedSearch);
        }

        if (sectionFilter !== "all") {
          params.append("section", sectionFilter);
        }

        if (statusFilter === "active") {
          params.append("status", "open");
          params.append("status", "in_progress");
        } else if (statusFilter !== "all") {
          params.append("status", statusFilter);
        }

        if (priorityFilter !== "all") {
          params.append("priority", priorityFilter);
        }

        params.set("sort", sortOption);

        const response = await fetch(`/app2/api/dev-tasks?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal,
        });

        if (!response.ok) {
          const { error: message } = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(message || "Failed to load tasks");
        }

        const data = await response.json();
        setTasks(data.tasks ?? []);
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.error(err);
        setError(err.message || "Failed to load tasks");
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch, sectionFilter, statusFilter, priorityFilter, sortOption]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchTasks(controller.signal);
    return () => controller.abort();
  }, [fetchTasks]);

  const activeTasks = useMemo(
    () => tasks.filter((task) => task.status !== "done"),
    [tasks]
  );

  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status === "done"),
    [tasks]
  );

  const resetCreateForm = () => {
    setNewTask({
      section: "schedule",
      title: "",
      description: "",
      priority: "medium",
      status: "open",
    });
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newTask.title.trim()) {
      setCreateError("Title is required.");
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const response = await fetch("/app2/api/dev-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
      section: newTask.section,
          title: newTask.title.trim(),
          description: newTask.description.trim() || undefined,
          status: newTask.status,
          priority: newTask.priority,
        }),
      });

      if (!response.ok) {
        const { error: message } = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(message || "Failed to create task");
      }

      resetCreateForm();
      await fetchTasks();
    } catch (err: any) {
      console.error(err);
      setCreateError(err.message || "Failed to create task");
    } finally {
      setCreating(false);
    }
  };

  const updateTask = async (
    id: string,
    payload: Partial<Pick<DevTask, "status" | "priority" | "title" | "description" | "section">>
  ) => {
    try {
      const response = await fetch(`/app2/api/dev-tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const { error: message } = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(message || "Failed to update task");
      }

      const updated = (await response.json()) as DevTask;
      setTasks((prev) =>
        prev.map((task) => (task.id === id ? updated : task))
      );
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to update task");
      throw err;
    }
  };

  const deleteTask = async (id: string) => {
    try {
      const response = await fetch(`/app2/api/dev-tasks/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const { error: message } = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(message || "Failed to delete task");
      }

      setTasks((prev) => prev.filter((task) => task.id !== id));
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to delete task");
      throw err;
    }
  };

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-primary" />
            Dev Notebook
          </h2>
          <p className="text-sm text-gray-400">
            Capture quick development notes, backlog items, and mark them complete when delivered.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-400">
            <span className="text-white font-semibold">{activeTasks.length}</span> active
          </div>
          <button
            onClick={() => fetchTasks()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-700 text-sm font-medium text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="search"
            className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Search tasks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value as SectionOption)}
        >
          {SECTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusOption)}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <select
            className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as PriorityOption)}
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* New Task */}
      <div className="border border-dashed border-gray-700 rounded-xl p-4">
        <button
          className="w-full flex items-center justify-between text-left"
          onClick={() => setFormOpen((prev) => !prev)}
        >
          <div className="flex items-center gap-2">
            <div className="inline-flex w-8 h-8 items-center justify-center rounded-full bg-primary/20">
              <Plus className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Add a new task</p>
              <p className="text-xs text-gray-400">
                Capture a quick note or backlog item.
              </p>
            </div>
          </div>
          <ChevronDown
            className={cn(
              "w-5 h-5 text-gray-500 transition-transform",
              formOpen && "rotate-180"
            )}
          />
        </button>

        {formOpen && (
          <form className="mt-4 grid gap-3" onSubmit={handleCreateTask}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">
                  Title
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Short task title"
                  value={newTask.title}
                  onChange={(e) =>
                    setNewTask((prev) => ({ ...prev, title: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">
                  Section
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  value={newTask.section}
                  onChange={(e) =>
                    setNewTask((prev) => ({
                      ...prev,
                      section: e.target.value as DevTaskSection,
                    }))
                  }
                >
                  {SECTION_OPTIONS.filter((option) => option.value !== "all").map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">
                  Priority
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  value={newTask.priority}
                  onChange={(e) =>
                    setNewTask((prev) => ({
                      ...prev,
                      priority: e.target.value as DevTaskPriority,
                    }))
                  }
                >
                  {PRIORITY_OPTIONS.filter((option) => option.value !== "all").map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">
                Description
              </label>
              <textarea
                className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent min-h-[80px]"
                placeholder="Optional details, acceptance criteria, notes..."
                value={newTask.description}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-3">
                <label className="block text-xs text-gray-400 uppercase tracking-wide">
                  Status
                </label>
                <select
                  className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  value={newTask.status}
                  onChange={(e) =>
                    setNewTask((prev) => ({
                      ...prev,
                      status: e.target.value as DevTaskStatus,
                    }))
                  }
                >
                  {["open", "in_progress", "done"].map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABELS[value as DevTask["status"]]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                {createError && (
                  <p className="text-sm text-red-400">{createError}</p>
                )}
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-gray-950 font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Add Task
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-lg px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Active Tasks */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
            Active Tasks ({activeTasks.length})
          </h3>
        </div>
        {loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : activeTasks.length === 0 ? (
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6 text-center text-gray-400 text-sm">
            No active tasks. Add a new note above to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {activeTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onUpdate={updateTask}
                onDelete={deleteTask}
              />
            ))}
          </div>
        )}
      </div>

      {/* Completed Tasks */}
      <div className="border-t border-gray-800 pt-4">
        <button
          className="flex items-center justify-between w-full text-left text-sm font-semibold text-gray-300 uppercase tracking-wide"
          onClick={() => setShowCompleted((prev) => !prev)}
        >
          <span>Completed ({completedTasks.length})</span>
          <ChevronDown
            className={cn(
              "w-4 h-4 transition-transform",
              showCompleted && "rotate-180"
            )}
          />
        </button>

        {showCompleted && (
          <div className="mt-3 space-y-3">
            {completedTasks.length === 0 ? (
              <p className="text-xs text-gray-500">
                Completed items will appear here for future reference.
              </p>
            ) : (
              completedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onUpdate={updateTask}
                  onDelete={deleteTask}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface TaskCardProps {
  task: DevTask;
  onUpdate: (
    id: string,
    payload: Partial<Pick<DevTask, "status" | "priority" | "title" | "description" | "section">>
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function TaskCard({ task, onUpdate, onDelete }: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (isEditing && !expanded) {
      setExpanded(true);
    }
  }, [isEditing, expanded]);

  const handleStatusChange = async (status: DevTask["status"]) => {
    setError(null);
    try {
      await onUpdate(task.id, { status });
    } catch (err: any) {
      setError(err.message || "Failed to change status");
      throw err;
    }
  };

  const handlePriorityChange = async (priority: DevTask["priority"]) => {
    setError(null);
    try {
      await onUpdate(task.id, { priority });
    } catch (err: any) {
      setError(err.message || "Failed to change priority");
      throw err;
    }
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) {
      setError("Title cannot be empty");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onUpdate(task.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
      });
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || "Failed to update task");
    } finally {
      setSaving(false);
    }
  };

  const priorityLabel =
    PRIORITY_OPTIONS.find((option) => option.value === task.priority)?.label ??
    task.priority;

  const handleDelete = async () => {
    setError(null);
    try {
      await onDelete(task.id);
    } catch (err: any) {
      setError(err.message || "Failed to delete task");
    }
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-4 shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex items-center gap-3">
          {task.status === "done" ? (
            <CheckCircle2 className="w-5 h-5 text-primary" />
          ) : (
            <CircleDot className="w-5 h-5 text-gray-500" />
          )}
          <span
            className={cn(
              "text-lg font-semibold text-white",
              task.status === "done" && "line-through text-gray-500"
            )}
          >
            {task.title}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "px-2 py-1 rounded-full border text-xs font-semibold uppercase tracking-wide",
              PRIORITY_COLORS[task.priority]
            )}
          >
            {priorityLabel}
          </span>
          <ChevronDown
            className={cn(
              "w-5 h-5 text-gray-500 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

      <div className={cn("mt-4 space-y-3", !expanded && "hidden")}>
        <div className="space-y-2">
          {isEditing ? (
            <input
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          ) : null}

          {isEditing ? (
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent min-h-[80px]"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Add additional context..."
            />
          ) : task.description ? (
            <p
              className={cn(
                "text-sm text-gray-300",
                task.status === "done" && "line-through text-gray-500"
              )}
            >
              {task.description}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <span className="px-2 py-1 rounded-full border border-primary/40 text-primary/90 bg-primary/10 uppercase tracking-wide font-semibold">
              {task.section}
            </span>
            <span className="text-gray-500">
              Status:{" "}
              <span className="text-gray-300">{STATUS_LABELS[task.status]}</span>
            </span>
            <span className="text-gray-500">
              Created: <span className="text-gray-300">{formatDateTime(task.created_at)}</span>
            </span>
            {task.completed_at && (
              <span className="text-gray-500">
                Completed:{" "}
                <span className="text-gray-300">{formatDateTime(task.completed_at)}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 w-full lg:w-auto">
          <div className="grid grid-cols-2 gap-3">
            <select
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
              value={task.status}
              onChange={(e) =>
                handleStatusChange(e.target.value as DevTaskStatus)
              }
            >
              {["open", "in_progress", "done"].map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value as DevTask["status"]]}
                </option>
              ))}
            </select>
            <select
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
              value={task.priority}
              onChange={(e) =>
                handlePriorityChange(e.target.value as DevTaskPriority)
              }
            >
              {["high", "medium", "low"].map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_OPTIONS.find((option) => option.value === value)?.label ?? value}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            {isEditing ? (
              <>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-primary text-gray-950 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditTitle(task.title);
                    setEditDescription(task.description ?? "");
                  }}
                  className="px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-red-500/50 text-sm text-red-300 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
