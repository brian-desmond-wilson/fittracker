import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TouchableWithoutFeedback,
  StatusBar,
  Animated,
  PanResponder,
} from "react-native";
import {
  SlidersHorizontal,
  RefreshCw,
  Search,
  Plus,
  ChevronDown,
  CheckCircle2,
  CircleDot,
  CircleDashed,
  Trash2,
  Edit3,
  X,
  ChevronLeft,
} from "lucide-react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from "../../lib/supabase";
import {
  DevTask,
  DevTaskSection,
  DevTaskStatus,
  DevTaskPriority,
} from "../../types/dev-task";

interface DevTaskManagerProps {
  userId: string;
  onClose: () => void;
}

type SectionOption = "all" | DevTaskSection;
type StatusOption = "all" | DevTaskStatus | "active";
type PriorityOption = "all" | DevTaskPriority;

const SECTION_OPTIONS: { value: SectionOption; label: string }[] = [
  { value: "all", label: "All sections" },
  { value: "home", label: "Home" },
  { value: "schedule", label: "Schedule" },
  { value: "track", label: "Track" },
  { value: "progress", label: "Progress" },
  { value: "profile", label: "Profile" },
  { value: "settings", label: "Settings" },
  { value: "training", label: "Training" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS: { value: StatusOption; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active (Open + In Progress)" },
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

const SORT_OPTIONS = [
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
];

const PRIORITY_COLORS: Record<DevTaskPriority, string> = {
  high: "#EF4444",
  medium: "#EAB308",
  low: "#10B981",
};

const STATUS_LABELS: Record<DevTaskStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Completed",
};

export function DevTaskManager({ userId, onClose }: DevTaskManagerProps) {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<DevTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [sectionFilter, setSectionFilter] = useState<SectionOption>("all");
  const [statusFilter, setStatusFilter] = useState<StatusOption>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityOption>("all");
  const [sortOption, setSortOption] = useState("created_desc");

  const [showAddForm, setShowAddForm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);

  // Dropdown visibility states
  const [showSectionDropdown, setShowSectionDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Add Task modal dropdown states
  const [showAddSectionDropdown, setShowAddSectionDropdown] = useState(false);
  const [showAddPriorityDropdown, setShowAddPriorityDropdown] = useState(false);
  const [showAddStatusDropdown, setShowAddStatusDropdown] = useState(false);

  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    section: "schedule" as DevTaskSection,
    priority: "medium" as DevTaskPriority,
    status: "open" as DevTaskStatus,
  });

  // Pan responder for swipe-down gesture
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to vertical swipes
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow downward swipes
        if (gestureState.dy > 0) {
          // Could add animation here if desired
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // If swiped down more than 100 pixels, close the modal
        if (gestureState.dy > 100) {
          setShowAddForm(false);
        }
      },
    })
  ).current;

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);

      let query = supabase
        .from("dev_tasks")
        .select("*")
        .eq("user_id", userId);

      // Apply filters
      if (sectionFilter !== "all") {
        query = query.eq("section", sectionFilter);
      }

      if (statusFilter === "active") {
        query = query.in("status", ["open", "in_progress"]);
      } else if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (priorityFilter !== "all") {
        query = query.eq("priority", priorityFilter);
      }

      // Apply sorting
      if (sortOption === "created_desc") {
        query = query.order("created_at", { ascending: false });
      } else if (sortOption === "created_asc") {
        query = query.order("created_at", { ascending: true });
      }

      const { data, error } = await query;

      if (error) throw error;

      // Apply search filter in memory
      let filteredData = data || [];
      if (searchTerm.trim()) {
        const search = searchTerm.toLowerCase();
        filteredData = filteredData.filter(
          (task) =>
            task.title.toLowerCase().includes(search) ||
            task.description?.toLowerCase().includes(search)
        );
      }

      setTasks(filteredData);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      Alert.alert("Error", "Failed to load tasks");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, sectionFilter, statusFilter, priorityFilter, sortOption, searchTerm]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const activeTasks = useMemo(
    () => tasks.filter((task) => task.status !== "done"),
    [tasks]
  );

  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status === "done"),
    [tasks]
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchTasks();
  };

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) {
      Alert.alert("Error", "Title is required");
      return;
    }

    try {
      const { error } = await supabase.from("dev_tasks").insert({
        user_id: userId,
        title: newTask.title.trim(),
        description: newTask.description.trim() || null,
        section: newTask.section,
        priority: newTask.priority,
        status: newTask.status,
      });

      if (error) throw error;

      setNewTask({
        title: "",
        description: "",
        section: "schedule",
        priority: "medium",
        status: "open",
      });
      setShowAddForm(false);
      fetchTasks();
    } catch (error) {
      console.error("Error creating task:", error);
      Alert.alert("Error", "Failed to create task");
    }
  };

  const handleUpdateTask = async (
    id: string,
    updates: Partial<Omit<DevTask, "id" | "user_id" | "created_at" | "updated_at">>
  ) => {
    try {
      const updateData: any = { ...updates };

      // If status is being changed to done, set completed_at
      if (updates.status === "done") {
        updateData.completed_at = new Date().toISOString();
      } else if (updates.status && updates.status !== "done") {
        updateData.completed_at = null;
      }

      const { error } = await supabase
        .from("dev_tasks")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      fetchTasks();
    } catch (error) {
      console.error("Error updating task:", error);
      Alert.alert("Error", "Failed to update task");
    }
  };

  const handleDeleteTask = async (id: string) => {
    Alert.alert(
      "Delete Task",
      "Are you sure you want to delete this task?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const { error} = await supabase
                .from("dev_tasks")
                .delete()
                .eq("id", id);

              if (error) throw error;

              fetchTasks();
            } catch (error) {
              console.error("Error deleting task:", error);
              Alert.alert("Error", "Failed to delete task");
            }
          },
        },
      ]
    );
  };

  const closeAllDropdowns = () => {
    setShowSectionDropdown(false);
    setShowStatusDropdown(false);
    setShowPriorityDropdown(false);
    setShowSortDropdown(false);
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.fullScreenContainer, { paddingTop: insets.top }]}>
        {/* Navigation Header */}
        <View style={styles.navHeader}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Profile</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          <TouchableWithoutFeedback onPress={closeAllDropdowns}>
            <View>
              {/* Page Title */}
              <Text style={styles.pageTitle}>Development Tasks</Text>
              <Text style={styles.pageSubtitle}>
                Capture quick development notes, backlog items, and mark them complete when delivered.
              </Text>

              {/* Stats and Refresh */}
              <View style={styles.statsRow}>
                <Text style={styles.activeCount}>
                  <Text style={styles.activeCountNumber}>{activeTasks.length}</Text> active tasks
                </Text>
                <TouchableOpacity
                  onPress={handleRefresh}
                  style={styles.refreshButton}
                  disabled={refreshing}
                >
                  <RefreshCw size={20} color="#9CA3AF" />
                  <Text style={styles.refreshButtonText}>Refresh</Text>
                </TouchableOpacity>
              </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Search size={16} color="#6B7280" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search tasks..."
          placeholderTextColor="#6B7280"
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
        {searchTerm.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchTerm("")}
            style={styles.clearButton}
          >
            <X size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => {
            setShowSectionDropdown(!showSectionDropdown);
            setShowStatusDropdown(false);
            setShowPriorityDropdown(false);
            setShowSortDropdown(false);
          }}
        >
          <Text style={styles.filterButtonText}>
            {SECTION_OPTIONS.find((o) => o.value === sectionFilter)?.label}
          </Text>
          <ChevronDown size={16} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => {
            setShowStatusDropdown(!showStatusDropdown);
            setShowSectionDropdown(false);
            setShowPriorityDropdown(false);
            setShowSortDropdown(false);
          }}
        >
          <Text style={styles.filterButtonText}>
            {STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label}
          </Text>
          <ChevronDown size={16} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => {
            setShowPriorityDropdown(!showPriorityDropdown);
            setShowSectionDropdown(false);
            setShowStatusDropdown(false);
            setShowSortDropdown(false);
          }}
        >
          <Text style={styles.filterButtonText}>
            {PRIORITY_OPTIONS.find((o) => o.value === priorityFilter)?.label}
          </Text>
          <ChevronDown size={16} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => {
            setShowSortDropdown(!showSortDropdown);
            setShowSectionDropdown(false);
            setShowStatusDropdown(false);
            setShowPriorityDropdown(false);
          }}
        >
          <Text style={styles.filterButtonText}>
            {SORT_OPTIONS.find((o) => o.value === sortOption)?.label}
          </Text>
          <ChevronDown size={16} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Dropdown Modals */}
      {showSectionDropdown && (
        <Modal transparent visible={showSectionDropdown} animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowSectionDropdown(false)}>
            <View style={styles.dropdownModalOverlay}>
              <View style={styles.dropdownModalContent}>
                <Text style={styles.dropdownModalTitle}>Section</Text>
                <ScrollView style={styles.dropdownModalScroll}>
                  {SECTION_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.dropdownModalItem,
                        option.value === sectionFilter && styles.dropdownModalItemSelected,
                      ]}
                      onPress={() => {
                        setSectionFilter(option.value);
                        setShowSectionDropdown(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownModalItemText,
                          option.value === sectionFilter && styles.dropdownModalItemTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {showStatusDropdown && (
        <Modal transparent visible={showStatusDropdown} animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowStatusDropdown(false)}>
            <View style={styles.dropdownModalOverlay}>
              <View style={styles.dropdownModalContent}>
                <Text style={styles.dropdownModalTitle}>Status</Text>
                <ScrollView style={styles.dropdownModalScroll}>
                  {STATUS_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.dropdownModalItem,
                        option.value === statusFilter && styles.dropdownModalItemSelected,
                      ]}
                      onPress={() => {
                        setStatusFilter(option.value);
                        setShowStatusDropdown(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownModalItemText,
                          option.value === statusFilter && styles.dropdownModalItemTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {showPriorityDropdown && (
        <Modal transparent visible={showPriorityDropdown} animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowPriorityDropdown(false)}>
            <View style={styles.dropdownModalOverlay}>
              <View style={styles.dropdownModalContent}>
                <Text style={styles.dropdownModalTitle}>Priority</Text>
                <ScrollView style={styles.dropdownModalScroll}>
                  {PRIORITY_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.dropdownModalItem,
                        option.value === priorityFilter && styles.dropdownModalItemSelected,
                      ]}
                      onPress={() => {
                        setPriorityFilter(option.value);
                        setShowPriorityDropdown(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownModalItemText,
                          option.value === priorityFilter && styles.dropdownModalItemTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {showSortDropdown && (
        <Modal transparent visible={showSortDropdown} animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowSortDropdown(false)}>
            <View style={styles.dropdownModalOverlay}>
              <View style={styles.dropdownModalContent}>
                <Text style={styles.dropdownModalTitle}>Sort</Text>
                <ScrollView style={styles.dropdownModalScroll}>
                  {SORT_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.dropdownModalItem,
                        option.value === sortOption && styles.dropdownModalItemSelected,
                      ]}
                      onPress={() => {
                        setSortOption(option.value);
                        setShowSortDropdown(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownModalItemText,
                          option.value === sortOption && styles.dropdownModalItemTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Add Task Button */}
      <TouchableOpacity
        style={styles.addTaskButton}
        onPress={() => setShowAddForm(true)}
      >
        <Plus size={20} color="#22C55E" />
        <Text style={styles.addTaskButtonText}>Add a new task</Text>
      </TouchableOpacity>

      {/* Active Tasks */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACTIVE TASKS ({activeTasks.length})</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#22C55E" style={styles.loader} />
        ) : activeTasks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No active tasks. Add a new note above to get started.
            </Text>
          </View>
        ) : (
          activeTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
            />
          ))
        )}
      </View>

      {/* Completed Tasks */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.completedHeader}
          onPress={() => setShowCompleted(!showCompleted)}
        >
          <Text style={styles.sectionTitle}>COMPLETED ({completedTasks.length})</Text>
          <ChevronDown
            size={16}
            color="#9CA3AF"
            style={[
              styles.chevron,
              showCompleted && styles.chevronRotated,
            ]}
          />
        </TouchableOpacity>
        {showCompleted &&
          completedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
            />
          ))}
      </View>

            </View>
          </TouchableWithoutFeedback>
        </ScrollView>

        {/* Add Task Modal */}
        <Modal
          visible={showAddForm}
          transparent
          animationType="slide"
          onRequestClose={() => setShowAddForm(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowAddForm(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  {/* Drag Handle Area */}
                  <View {...panResponder.panHandlers} style={styles.modalDragArea}>
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>Add a new task</Text>
                    <Text style={styles.modalSubtitle}>Capture a quick note or backlog item.</Text>
                  </View>

              <Text style={styles.label}>TITLE</Text>
              <TextInput
                style={styles.input}
                placeholder="Short task title"
                placeholderTextColor="#6B7280"
                value={newTask.title}
                onChangeText={(text) => setNewTask((prev) => ({ ...prev, title: text }))}
              />

              <Text style={styles.label}>SECTION</Text>
              <TouchableOpacity
                style={styles.select}
                onPress={() => setShowAddSectionDropdown(true)}
              >
                <Text style={styles.selectText}>
                  {SECTION_OPTIONS.find((o) => o.value === newTask.section)?.label}
                </Text>
                <ChevronDown size={16} color="#9CA3AF" />
              </TouchableOpacity>

              <Text style={styles.label}>PRIORITY</Text>
              <TouchableOpacity
                style={styles.select}
                onPress={() => setShowAddPriorityDropdown(true)}
              >
                <Text style={styles.selectText}>
                  {PRIORITY_OPTIONS.find((o) => o.value === newTask.priority)?.label}
                </Text>
                <ChevronDown size={16} color="#9CA3AF" />
              </TouchableOpacity>

              <Text style={styles.label}>DESCRIPTION</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Optional details, acceptance criteria, notes..."
                placeholderTextColor="#6B7280"
                value={newTask.description}
                onChangeText={(text) =>
                  setNewTask((prev) => ({ ...prev, description: text }))
                }
                multiline
                numberOfLines={4}
              />

              <Text style={styles.label}>STATUS</Text>
              <TouchableOpacity
                style={styles.select}
                onPress={() => setShowAddStatusDropdown(true)}
              >
                <Text style={styles.selectText}>{STATUS_LABELS[newTask.status]}</Text>
                <ChevronDown size={16} color="#9CA3AF" />
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setShowAddForm(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.addButton]}
                  onPress={handleCreateTask}
                >
                  <Plus size={16} color="#0A0F1E" />
                  <Text style={styles.addButtonText}>Add Task</Text>
                </TouchableOpacity>
              </View>

              {/* Section Dropdown Modal */}
              {showAddSectionDropdown && (
                <Modal transparent visible={showAddSectionDropdown} animationType="fade">
                  <TouchableWithoutFeedback onPress={() => setShowAddSectionDropdown(false)}>
                    <View style={styles.dropdownModalOverlay}>
                      <View style={styles.dropdownModalContent}>
                        <Text style={styles.dropdownModalTitle}>Section</Text>
                        <Text style={styles.dropdownModalSubtitle}>Choose a section for this task</Text>
                        <ScrollView style={styles.dropdownModalScroll}>
                          {SECTION_OPTIONS.filter((o) => o.value !== "all").map((option) => (
                            <TouchableOpacity
                              key={option.value}
                              style={[
                                styles.dropdownModalItem,
                                option.value === newTask.section && styles.dropdownModalItemSelected,
                              ]}
                              onPress={() => {
                                setNewTask((prev) => ({ ...prev, section: option.value as DevTaskSection }));
                                setShowAddSectionDropdown(false);
                              }}
                            >
                              <Text
                                style={[
                                  styles.dropdownModalItemText,
                                  option.value === newTask.section && styles.dropdownModalItemTextSelected,
                                ]}
                              >
                                {option.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    </View>
                  </TouchableWithoutFeedback>
                </Modal>
              )}

              {/* Priority Dropdown Modal */}
              {showAddPriorityDropdown && (
                <Modal transparent visible={showAddPriorityDropdown} animationType="fade">
                  <TouchableWithoutFeedback onPress={() => setShowAddPriorityDropdown(false)}>
                    <View style={styles.dropdownModalOverlay}>
                      <View style={styles.dropdownModalContent}>
                        <Text style={styles.dropdownModalTitle}>Priority</Text>
                        <Text style={styles.dropdownModalSubtitle}>Choose a priority level</Text>
                        <ScrollView style={styles.dropdownModalScroll}>
                          {PRIORITY_OPTIONS.filter((o) => o.value !== "all").map((option) => (
                            <TouchableOpacity
                              key={option.value}
                              style={[
                                styles.dropdownModalItem,
                                option.value === newTask.priority && styles.dropdownModalItemSelected,
                              ]}
                              onPress={() => {
                                setNewTask((prev) => ({ ...prev, priority: option.value as DevTaskPriority }));
                                setShowAddPriorityDropdown(false);
                              }}
                            >
                              <Text
                                style={[
                                  styles.dropdownModalItemText,
                                  option.value === newTask.priority && styles.dropdownModalItemTextSelected,
                                ]}
                              >
                                {option.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    </View>
                  </TouchableWithoutFeedback>
                </Modal>
              )}

              {/* Status Dropdown Modal */}
              {showAddStatusDropdown && (
                <Modal transparent visible={showAddStatusDropdown} animationType="fade">
                  <TouchableWithoutFeedback onPress={() => setShowAddStatusDropdown(false)}>
                    <View style={styles.dropdownModalOverlay}>
                      <View style={styles.dropdownModalContent}>
                        <Text style={styles.dropdownModalTitle}>Status</Text>
                        <Text style={styles.dropdownModalSubtitle}>Choose a status for this task</Text>
                        <ScrollView style={styles.dropdownModalScroll}>
                          {["open", "in_progress", "done"].map((status) => (
                            <TouchableOpacity
                              key={status}
                              style={[
                                styles.dropdownModalItem,
                                newTask.status === status && styles.dropdownModalItemSelected,
                              ]}
                              onPress={() => {
                                setNewTask((prev) => ({ ...prev, status: status as DevTaskStatus }));
                                setShowAddStatusDropdown(false);
                              }}
                            >
                              <Text
                                style={[
                                  styles.dropdownModalItemText,
                                  newTask.status === status && styles.dropdownModalItemTextSelected,
                                ]}
                              >
                                {STATUS_LABELS[status as DevTaskStatus]}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    </View>
                  </TouchableWithoutFeedback>
                </Modal>
              )}
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    </>
  );
}

interface TaskCardProps {
  task: DevTask;
  onUpdate: (
    id: string,
    updates: Partial<Omit<DevTask, "id" | "user_id" | "created_at" | "updated_at">>
  ) => void;
  onDelete: (id: string) => void;
}

function TaskCard({ task, onUpdate, onDelete }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [editForm, setEditForm] = useState({
    title: task.title,
    description: task.description || "",
    section: task.section,
    priority: task.priority,
    status: task.status,
  });

  const handleSaveEdit = () => {
    if (!editForm.title.trim()) {
      Alert.alert("Error", "Title is required");
      return;
    }

    onUpdate(task.id, {
      title: editForm.title.trim(),
      description: editForm.description.trim() || null,
      section: editForm.section,
      priority: editForm.priority,
      status: editForm.status,
    });
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditForm({
      title: task.title,
      description: task.description || "",
      section: task.section,
      priority: task.priority,
      status: task.status,
    });
    setEditing(false);
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeaderLeft}>
          {task.status === "done" ? (
            <CheckCircle2 size={20} color="#22C55E" />
          ) : task.status === "in_progress" ? (
            <CircleDashed size={20} color="#3B82F6" />
          ) : (
            <CircleDot size={20} color="#6B7280" />
          )}
          <Text
            style={[
              styles.cardTitle,
              task.status === "done" && styles.cardTitleCompleted,
            ]}
            numberOfLines={1}
          >
            {task.title}
          </Text>
        </View>
        <View style={styles.cardHeaderRight}>
          <View
            style={[
              styles.priorityBadge,
              { backgroundColor: `${PRIORITY_COLORS[task.priority]}20` },
            ]}
          >
            <Text
              style={[styles.priorityText, { color: PRIORITY_COLORS[task.priority] }]}
            >
              {task.priority.toUpperCase()}
            </Text>
          </View>
          <ChevronDown
            size={16}
            color="#9CA3AF"
            style={[styles.chevron, expanded && styles.chevronRotated]}
          />
        </View>
      </TouchableOpacity>

      {expanded && !editing && (
        <View style={styles.cardContent}>
          {task.description && (
            <Text
              style={[
                styles.cardDescription,
                task.status === "done" && styles.cardDescriptionCompleted,
              ]}
            >
              {task.description}
            </Text>
          )}

          <View style={styles.cardMeta}>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{task.section.toUpperCase()}</Text>
            </View>
            <Text style={styles.cardMetaText}>
              Status: <Text style={styles.cardMetaValue}>{STATUS_LABELS[task.status]}</Text>
            </Text>
          </View>

          <View style={styles.cardMeta}>
            <Text style={styles.cardMetaText}>
              Created: <Text style={styles.cardMetaValue}>
                {new Date(task.created_at).toLocaleDateString()}
              </Text>
            </Text>
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.selectSmall}
              onPress={() => setShowStatusDropdown(true)}
            >
              <Text style={styles.selectSmallText}>{STATUS_LABELS[task.status]}</Text>
              <ChevronDown size={12} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.selectSmall}
              onPress={() => setShowPriorityDropdown(true)}
            >
              <Text style={styles.selectSmallText}>
                {PRIORITY_OPTIONS.find((o) => o.value === task.priority)?.label}
              </Text>
              <ChevronDown size={12} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={() => setEditing(true)}
            >
              <Edit3 size={14} color="#FFFFFF" />
              <Text style={styles.cancelButtonText}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, styles.deleteButtonLarge]}
              onPress={() => onDelete(task.id)}
            >
              <Trash2 size={14} color="#EF4444" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {expanded && editing && (
        <View style={styles.cardContent}>
          <TextInput
            style={styles.input}
            placeholder="Task title"
            placeholderTextColor="#6B7280"
            value={editForm.title}
            onChangeText={(text) => setEditForm((prev) => ({ ...prev, title: text }))}
          />

          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Add additional context..."
            placeholderTextColor="#6B7280"
            value={editForm.description}
            onChangeText={(text) => setEditForm((prev) => ({ ...prev, description: text }))}
            multiline
            numberOfLines={3}
          />

          <View style={styles.cardMeta}>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{editForm.section.toUpperCase()}</Text>
            </View>
            <Text style={styles.cardMetaText}>
              Status: <Text style={styles.cardMetaValue}>{STATUS_LABELS[editForm.status]}</Text>
            </Text>
          </View>

          <View style={styles.cardMeta}>
            <Text style={styles.cardMetaText}>
              Created: <Text style={styles.cardMetaValue}>
                {new Date(task.created_at).toLocaleDateString()}
              </Text>
            </Text>
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.selectSmall}
              onPress={() => setShowStatusDropdown(true)}
            >
              <Text style={styles.selectSmallText}>{STATUS_LABELS[editForm.status]}</Text>
              <ChevronDown size={12} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.selectSmall}
              onPress={() => setShowPriorityDropdown(true)}
            >
              <Text style={styles.selectSmallText}>
                {PRIORITY_OPTIONS.find((o) => o.value === editForm.priority)?.label}
              </Text>
              <ChevronDown size={12} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.modalButton, styles.addButton]}
              onPress={handleSaveEdit}
            >
              <Text style={styles.addButtonText}>Save</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={handleCancelEdit}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Status Dropdown Modal */}
      {showStatusDropdown && (
        <Modal transparent visible={showStatusDropdown} animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowStatusDropdown(false)}>
            <View style={styles.dropdownModalOverlay}>
              <View style={styles.dropdownModalContent}>
                <Text style={styles.dropdownModalTitle}>Change Status</Text>
                <ScrollView style={styles.dropdownModalScroll}>
                  {["open", "in_progress", "done"].map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.dropdownModalItem,
                        (editing ? editForm.status : task.status) === status && styles.dropdownModalItemSelected,
                      ]}
                      onPress={() => {
                        if (editing) {
                          setEditForm((prev) => ({ ...prev, status: status as DevTaskStatus }));
                        } else {
                          onUpdate(task.id, { status: status as DevTaskStatus });
                        }
                        setShowStatusDropdown(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownModalItemText,
                          (editing ? editForm.status : task.status) === status && styles.dropdownModalItemTextSelected,
                        ]}
                      >
                        {STATUS_LABELS[status as DevTaskStatus]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Priority Dropdown Modal */}
      {showPriorityDropdown && (
        <Modal transparent visible={showPriorityDropdown} animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowPriorityDropdown(false)}>
            <View style={styles.dropdownModalOverlay}>
              <View style={styles.dropdownModalContent}>
                <Text style={styles.dropdownModalTitle}>Change Priority</Text>
                <ScrollView style={styles.dropdownModalScroll}>
                  {["high", "medium", "low"].map((priority) => (
                    <TouchableOpacity
                      key={priority}
                      style={[
                        styles.dropdownModalItem,
                        (editing ? editForm.priority : task.priority) === priority && styles.dropdownModalItemSelected,
                      ]}
                      onPress={() => {
                        if (editing) {
                          setEditForm((prev) => ({ ...prev, priority: priority as DevTaskPriority }));
                        } else {
                          onUpdate(task.id, { priority: priority as DevTaskPriority });
                        }
                        setShowPriorityDropdown(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownModalItemText,
                          (editing ? editForm.priority : task.priority) === priority && styles.dropdownModalItemTextSelected,
                        ]}
                      >
                        {PRIORITY_OPTIONS.find((o) => o.value === priority)?.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#0A0F1E',
  },
  navHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  activeCount: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  activeCountNumber: {
    fontWeight: '600',
    fontSize: 20,
    color: '#FFFFFF',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
  },
  refreshButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1F2937",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  filterRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  filterButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1F2937",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterButtonText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  dropdownModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dropdownModalContent: {
    backgroundColor: "#111827",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#374151",
    width: "100%",
    maxWidth: 400,
    maxHeight: 400,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  dropdownModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  dropdownModalSubtitle: {
    fontSize: 14,
    color: "#9CA3AF",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: "#374151",
  },
  dropdownModalScroll: {
    maxHeight: 300,
  },
  dropdownModalItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  dropdownModalItemSelected: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
  },
  dropdownModalItemText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "400",
  },
  dropdownModalItemTextSelected: {
    color: "#22C55E",
    fontWeight: "600",
  },
  addTaskButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#22C55E",
    paddingVertical: 16,
    marginBottom: 24,
  },
  addTaskButtonText: {
    fontSize: 16,
    color: "#22C55E",
    fontWeight: "600",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 1,
    marginBottom: 16,
    textTransform: "uppercase",
  },
  completedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  loader: {
    paddingVertical: 32,
  },
  emptyState: {
    backgroundColor: "rgba(31, 41, 55, 0.5)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 16,
  },
  emptyStateText: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1F2937",
    marginBottom: 12,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    flex: 1,
  },
  cardTitleCompleted: {
    textDecorationLine: "line-through",
    color: "#6B7280",
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  chevron: {
    transform: [{ rotate: "0deg" }],
  },
  chevronRotated: {
    transform: [{ rotate: "180deg" }],
  },
  cardContent: {
    padding: 16,
    paddingTop: 0,
    gap: 12,
  },
  cardDescription: {
    fontSize: 14,
    color: "#D1D5DB",
    lineHeight: 20,
  },
  cardDescriptionCompleted: {
    textDecorationLine: "line-through",
    color: "#6B7280",
  },
  cardMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  sectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  sectionBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#22C55E",
    letterSpacing: 0.5,
  },
  cardMetaText: {
    fontSize: 11,
    color: "#6B7280",
  },
  cardMetaValue: {
    color: "#D1D5DB",
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
  },
  selectSmall: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1F2937",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#374151",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectSmallText: {
    fontSize: 12,
    color: "#FFFFFF",
  },
  deleteButton: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#111827",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 12,
    maxHeight: "85%",
  },
  modalDragArea: {
    paddingVertical: 8,
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  modalHandle: {
    width: 36,
    height: 5,
    backgroundColor: "#374151",
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1F2937",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#FFFFFF",
    marginBottom: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1F2937",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  selectText: {
    fontSize: 14,
    color: "#FFFFFF",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  addButton: {
    backgroundColor: "#22C55E",
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0A0F1E",
  },
  deleteButtonLarge: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#EF4444",
  },
});
