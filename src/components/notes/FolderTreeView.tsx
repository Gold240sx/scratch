import { useCallback, useMemo, useState, useEffect, useRef, memo } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useNotes } from "../../context/NotesContext";
import { buildFolderTree, countNotesInFolder } from "../../lib/folderTree";
import { FolderNameDialog } from "./FolderNameDialog";
import { cleanTitle } from "../../lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  AddNoteIcon,
  FolderPlusIcon,
  PencilIcon,
  TrashIcon,
  NoteIcon,
  PinIcon,
  CopyIcon,
} from "../icons";
import * as notesService from "../../services/notes";
import type { FolderNode, NoteMetadata, Settings } from "../../types/note";

const STORAGE_KEY = "scratch:collapsedFolders";

const menuItemClass =
  "px-3 py-1.5 text-sm text-text cursor-pointer outline-none hover:bg-bg-muted focus:bg-bg-muted flex items-center gap-2 rounded-sm";

const menuSeparatorClass = "h-px bg-border my-1";

function loadCollapsedFolders(): Set<string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch {
    return new Set();
  }
}

function saveCollapsedFolders(folders: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...folders]));
  } catch {
    // Ignore localStorage errors
  }
}

// Compact file item for folder tree (VS Code / Obsidian style)
interface FileItemProps {
  note: NoteMetadata;
  depth: number;
  isSelected: boolean;
  isPinned: boolean;
  onSelect: (id: string) => void;
  onPin: (id: string) => Promise<void>;
  onUnpin: (id: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onDelete: (id: string) => void;
}

const FileItem = memo(function FileItem({
  note,
  depth,
  isSelected,
  isPinned,
  onSelect,
  onPin,
  onUnpin,
  onDuplicate,
  onDelete,
}: FileItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const handleClick = useCallback(() => onSelect(note.id), [onSelect, note.id]);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `note:${note.id}`,
    data: { type: "note", id: note.id },
  });

  useEffect(() => {
    if (isSelected) {
      itemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isSelected]);

  const handlePin = useCallback(async () => {
    try {
      await (isPinned ? onUnpin(note.id) : onPin(note.id));
    } catch (error) {
      console.error("Failed to pin/unpin note:", error);
    }
  }, [note.id, isPinned, onPin, onUnpin]);

  const handleCopyFilepath = useCallback(async () => {
    try {
      const folder = await notesService.getNotesFolder();
      if (folder) {
        await invoke("copy_to_clipboard", { text: `${folder}/${note.id}.md` });
      }
    } catch (error) {
      console.error("Failed to copy filepath:", error);
    }
  }, [note.id]);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={(el) => {
            setDragRef(el);
            (itemRef as React.MutableRefObject<HTMLDivElement | null>).current =
              el;
          }}
          {...attributes}
          {...listeners}
          className={`flex items-center gap-1.5 py-1.5 cursor-pointer rounded-md select-none ${
            isDragging
              ? "opacity-40"
              : isSelected
                ? "bg-bg-muted group-focus/notelist:ring-1 group-focus/notelist:ring-text-muted"
                : "hover:bg-bg-muted"
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px`, paddingRight: "8px" }}
          onClick={handleClick}
          role="button"
          tabIndex={-1}
        >
          {isPinned ? (
            <PinIcon className="w-4 h-4 stroke-[1.6] fill-current text-text-muted shrink-0" />
          ) : (
            <NoteIcon className="w-4 h-4 stroke-[1.6] opacity-50 shrink-0" />
          )}
          <span className="text-sm text-text truncate">
            {cleanTitle(note.title)}
          </span>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-44 bg-bg border border-border rounded-md shadow-lg py-1 z-50">
          <ContextMenu.Item className={menuItemClass} onSelect={handlePin}>
            <PinIcon className="w-4 h-4 stroke-[1.6]" />
            {isPinned ? "Unpin" : "Pin"}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => onDuplicate(note.id)}
          >
            <CopyIcon className="w-4 h-4 stroke-[1.6]" />
            Duplicate
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={handleCopyFilepath}
          >
            <CopyIcon className="w-4 h-4 stroke-[1.6]" />
            Copy Filepath
          </ContextMenu.Item>
          <ContextMenu.Separator className={menuSeparatorClass} />
          <ContextMenu.Item
            className={
              menuItemClass +
              " text-red-500 hover:text-red-500 focus:text-red-500"
            }
            onSelect={() => onDelete(note.id)}
          >
            <TrashIcon className="w-4 h-4 stroke-[1.6]" />
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

interface FolderItemProps {
  folder: FolderNode;
  depth: number;
  collapsedFolders: Set<string>;
  onToggleCollapse: (path: string) => void;
  selectedNoteId: string | null;
  pinnedIds: Set<string>;
  onSelectNote: (id: string) => void;
  onCreateNoteHere: (path: string) => void;
  onNewSubfolder: (parentPath: string) => void;
  onRenameFolder: (path: string, currentName: string) => void;
  onDeleteFolder: (path: string) => void;
  onPinNote: (id: string) => Promise<void>;
  onUnpinNote: (id: string) => Promise<void>;
  onDuplicateNote: (id: string) => Promise<void>;
  onDeleteNote: (id: string) => void;
}

const FolderItemComponent = memo(function FolderItem({
  folder,
  depth,
  collapsedFolders,
  onToggleCollapse,
  selectedNoteId,
  pinnedIds,
  onSelectNote,
  onCreateNoteHere,
  onNewSubfolder,
  onRenameFolder,
  onDeleteFolder,
  onPinNote,
  onUnpinNote,
  onDuplicateNote,
  onDeleteNote,
}: FolderItemProps) {
  const isCollapsed = collapsedFolders.has(folder.path);
  const noteCount = countNotesInFolder(folder);
  const isEmpty = noteCount === 0 && folder.children.length === 0;

  const handleClick = useCallback(() => {
    onToggleCollapse(folder.path);
  }, [onToggleCollapse, folder.path]);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `folder:${folder.path}`,
    data: { type: "folder", path: folder.path },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-folder:${folder.path}`,
    data: { type: "folder", path: folder.path },
  });

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={setDragRef}
          {...attributes}
          {...listeners}
          className={isDragging ? "opacity-40" : ""}
        >
          <div
            ref={setDropRef}
            className={`flex items-center gap-1.5 py-1.5 cursor-pointer rounded-md select-none transition-colors ${
              isOver ? "bg-accent/10 ring-1 ring-accent" : "hover:bg-bg-muted"
            }`}
            style={{ paddingLeft: `${depth * 12 + 8}px`, paddingRight: "8px" }}
            onClick={handleClick}
            role="button"
            tabIndex={-1}
          >
            {isCollapsed ? (
              <ChevronRightIcon className="w-4 h-4 stroke-[1.6] text-text-muted/60 shrink-0" />
            ) : (
              <ChevronDownIcon className="w-4 h-4 stroke-[1.6] text-text-muted/60 shrink-0" />
            )}
            <span className="text-sm text-text-muted truncate">
              {folder.name}
            </span>
          </div>

          {!isCollapsed && (
            <div className="flex flex-col gap-0.5">
              {folder.children.map((child) => (
                <FolderItemComponent
                  key={child.path}
                  folder={child}
                  depth={depth + 1}
                  collapsedFolders={collapsedFolders}
                  onToggleCollapse={onToggleCollapse}
                  selectedNoteId={selectedNoteId}
                  pinnedIds={pinnedIds}
                  onSelectNote={onSelectNote}
                  onCreateNoteHere={onCreateNoteHere}
                  onNewSubfolder={onNewSubfolder}
                  onRenameFolder={onRenameFolder}
                  onDeleteFolder={onDeleteFolder}
                  onPinNote={onPinNote}
                  onUnpinNote={onUnpinNote}
                  onDuplicateNote={onDuplicateNote}
                  onDeleteNote={onDeleteNote}
                />
              ))}
              {folder.notes.map((note) => (
                <FileItem
                  key={note.id}
                  note={note}
                  depth={depth + 1}
                  isSelected={selectedNoteId === note.id}
                  isPinned={pinnedIds.has(note.id)}
                  onSelect={onSelectNote}
                  onPin={onPinNote}
                  onUnpin={onUnpinNote}
                  onDuplicate={onDuplicateNote}
                  onDelete={onDeleteNote}
                />
              ))}
              {isEmpty && (
                <div
                  className="text-sm text-text-muted/50 py-1 select-none"
                  style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
                >
                  No notes here
                </div>
              )}
            </div>
          )}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-44 bg-bg border border-border rounded-md shadow-lg py-1 z-50">
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => onCreateNoteHere(folder.path)}
          >
            <AddNoteIcon className="w-4 h-4 stroke-[1.6]" />
            New Note
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => onNewSubfolder(folder.path)}
          >
            <FolderPlusIcon className="w-4 h-4 stroke-[1.6]" />
            New Subfolder
          </ContextMenu.Item>
          <ContextMenu.Separator className={menuSeparatorClass} />
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => {
              const parts = folder.path.split("/");
              onRenameFolder(folder.path, parts[parts.length - 1]);
            }}
          >
            <PencilIcon className="w-4 h-4 stroke-[1.6]" />
            Rename
          </ContextMenu.Item>
          <ContextMenu.Separator className={menuSeparatorClass} />
          <ContextMenu.Item
            className={
              menuItemClass +
              " text-red-500 hover:text-red-500 focus:text-red-500"
            }
            onSelect={() => onDeleteFolder(folder.path)}
          >
            <TrashIcon className="w-4 h-4 stroke-[1.6]" />
            Delete Folder
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

interface FolderTreeViewProps {
  pinnedIds: Set<string>;
  settings: Settings | null;
}

export function FolderTreeView({
  pinnedIds,
  settings: _settings,
}: FolderTreeViewProps) {
  const {
    notes,
    selectedNoteId,
    selectNote,
    createNoteInFolder,
    createFolder,
    deleteFolder,
    renameFolder,
    pinNote,
    unpinNote,
    duplicateNote,
    deleteNote,
    moveNote,
    moveFolder,
  } = useNotes();

  const [collapsedFolders, setCollapsedFolders] =
    useState<Set<string>>(loadCollapsedFolders);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [folderToRename, setFolderToRename] = useState<string | null>(null);
  const [renameDefaultValue, setRenameDefaultValue] = useState("");
  const [subfolderDialogOpen, setSubfolderDialogOpen] = useState(false);
  const [subfolderParent, setSubfolderParent] = useState("");
  const [noteDeleteDialogOpen, setNoteDeleteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [knownFolders, setKnownFolders] = useState<string[]>([]);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // dnd-kit sensor — require 5px movement before starting drag to avoid interfering with clicks
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Load known folders from disk (includes empty folders)
  useEffect(() => {
    notesService
      .listFolders()
      .then(setKnownFolders)
      .catch(() => setKnownFolders([]));
  }, [notes]);

  // Persist collapsed state
  useEffect(() => {
    saveCollapsedFolders(collapsedFolders);
  }, [collapsedFolders]);

  const tree = useMemo(
    () => buildFolderTree(notes, pinnedIds, knownFolders),
    [notes, pinnedIds, knownFolders],
  );

  const handleToggleCollapse = useCallback((path: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleNewSubfolder = useCallback((parentPath: string) => {
    setSubfolderParent(parentPath);
    setSubfolderDialogOpen(true);
  }, []);

  const handleRenameFolder = useCallback(
    (path: string, currentName: string) => {
      setFolderToRename(path);
      setRenameDefaultValue(currentName);
      setRenameDialogOpen(true);
    },
    [],
  );

  const handleDeleteFolder = useCallback((path: string) => {
    setFolderToDelete(path);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (folderToDelete) {
      await deleteFolder(folderToDelete);
      setFolderToDelete(null);
      setDeleteDialogOpen(false);
    }
  }, [folderToDelete, deleteFolder]);

  const openDeleteNoteDialog = useCallback((noteId: string) => {
    setNoteToDelete(noteId);
    setNoteDeleteDialogOpen(true);
  }, []);

  const handleNoteDeleteConfirm = useCallback(async () => {
    if (noteToDelete) {
      try {
        await deleteNote(noteToDelete);
      } catch (error) {
        console.error("Failed to delete note:", error);
      }
      setNoteToDelete(null);
      setNoteDeleteDialogOpen(false);
    }
  }, [noteToDelete, deleteNote]);

  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      if (folderToRename) {
        await renameFolder(folderToRename, newName);
        setFolderToRename(null);
        setRenameDialogOpen(false);
      }
    },
    [folderToRename, renameFolder],
  );

  const handleSubfolderConfirm = useCallback(
    async (name: string) => {
      await createFolder(subfolderParent, name);
      setSubfolderDialogOpen(false);
    },
    [subfolderParent, createFolder],
  );

  // dnd-kit handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === "note") {
      const noteId = data.id as string;
      const leaf = noteId.includes("/")
        ? noteId.substring(noteId.lastIndexOf("/") + 1)
        : noteId;
      setDragLabel(leaf);
    } else if (data?.type === "folder") {
      const path = data.path as string;
      const name = path.includes("/")
        ? path.substring(path.lastIndexOf("/") + 1)
        : path;
      setDragLabel(name);
    }
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setDragLabel(null);
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current;
      const overData = over.data.current;
      if (!activeData || !overData) return;

      const targetFolder =
        overData.type === "root" ? "" : (overData.path as string);

      if (activeData.type === "note") {
        const noteId = activeData.id as string;
        // Don't move to the same folder
        const noteParent = noteId.includes("/")
          ? noteId.substring(0, noteId.lastIndexOf("/"))
          : "";
        if (noteParent === targetFolder) return;
        await moveNote(noteId, targetFolder);
      } else if (activeData.type === "folder") {
        const folderPath = activeData.path as string;
        // Don't move into itself or a descendant
        if (
          targetFolder === folderPath ||
          targetFolder.startsWith(folderPath + "/")
        )
          return;
        // Don't move if already in the target parent
        const folderParent = folderPath.includes("/")
          ? folderPath.substring(0, folderPath.lastIndexOf("/"))
          : "";
        if (folderParent === targetFolder) return;
        await moveFolder(folderPath, targetFolder);
      }
    },
    [moveNote, moveFolder],
  );

  // Root drop zone
  const { setNodeRef: setRootDropRef, isOver: isRootOver } = useDroppable({
    id: "drop-root",
    data: { type: "root" },
  });

  // Listen for focus requests
  useEffect(() => {
    const handleFocus = () => containerRef.current?.focus();
    window.addEventListener("focus-note-list", handleFocus);
    return () => window.removeEventListener("focus-note-list", handleFocus);
  }, []);

  // Separate pinned and unpinned root notes
  const pinnedRootNotes = useMemo(
    () => tree.rootNotes.filter((n) => pinnedIds.has(n.id)),
    [tree.rootNotes, pinnedIds],
  );
  const unpinnedRootNotes = useMemo(
    () => tree.rootNotes.filter((n) => !pinnedIds.has(n.id)),
    [tree.rootNotes, pinnedIds],
  );

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          ref={(el) => {
            (
              containerRef as React.MutableRefObject<HTMLDivElement | null>
            ).current = el;
            setRootDropRef(el);
          }}
          tabIndex={0}
          data-note-list
          className={`group/notelist flex flex-col gap-0.5 p-1.5 outline-none transition-colors ${
            isRootOver ? "bg-accent/5" : ""
          }`}
        >
          {/* Pinned root notes */}
          {pinnedRootNotes.map((note) => (
            <FileItem
              key={note.id}
              note={note}
              depth={0}
              isSelected={selectedNoteId === note.id}
              isPinned={true}
              onSelect={selectNote}
              onPin={pinNote}
              onUnpin={unpinNote}
              onDuplicate={duplicateNote}
              onDelete={openDeleteNoteDialog}
            />
          ))}

          {/* Folders */}
          {tree.folders.map((folder) => (
            <FolderItemComponent
              key={folder.path}
              folder={folder}
              depth={0}
              collapsedFolders={collapsedFolders}
              onToggleCollapse={handleToggleCollapse}
              selectedNoteId={selectedNoteId}
              pinnedIds={pinnedIds}
              onSelectNote={selectNote}
              onCreateNoteHere={createNoteInFolder}
              onNewSubfolder={handleNewSubfolder}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onPinNote={pinNote}
              onUnpinNote={unpinNote}
              onDuplicateNote={duplicateNote}
              onDeleteNote={openDeleteNoteDialog}
            />
          ))}

          {/* Unpinned root notes */}
          {unpinnedRootNotes.map((note) => (
            <FileItem
              key={note.id}
              note={note}
              depth={0}
              isSelected={selectedNoteId === note.id}
              isPinned={false}
              onSelect={selectNote}
              onPin={pinNote}
              onUnpin={unpinNote}
              onDuplicate={duplicateNote}
              onDelete={openDeleteNoteDialog}
            />
          ))}
        </div>

        {/* Drag overlay — floating label while dragging */}
        <DragOverlay>
          {dragLabel && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-bg border border-border rounded-md shadow-lg text-sm text-text">
              <NoteIcon className="w-3.5 h-3.5 stroke-[1.6] opacity-50 shrink-0" />
              {dragLabel}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Delete folder confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the folder and all notes inside it.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename folder dialog */}
      <FolderNameDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        onConfirm={handleRenameConfirm}
        title="Rename Folder"
        description="Enter a new name for the folder"
        confirmLabel="Rename"
        defaultValue={renameDefaultValue}
      />

      {/* New subfolder dialog */}
      <FolderNameDialog
        open={subfolderDialogOpen}
        onOpenChange={setSubfolderDialogOpen}
        onConfirm={handleSubfolderConfirm}
        title="New Subfolder"
        description="Enter a name for the new subfolder"
        confirmLabel="Create"
      />

      {/* Delete note confirmation dialog */}
      <AlertDialog
        open={noteDeleteDialogOpen}
        onOpenChange={setNoteDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the note and all its content. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleNoteDeleteConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
