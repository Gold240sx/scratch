import { useCallback, useMemo, useState, useEffect, useRef, memo } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
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
import {
  FolderIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  AddNoteIcon,
  FolderPlusIcon,
  PencilIcon,
  TrashIcon,
  NoteIcon,
  PinIcon,
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
}

const FileItem = memo(function FileItem({
  note,
  depth,
  isSelected,
  isPinned,
  onSelect,
}: FileItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const handleClick = useCallback(() => onSelect(note.id), [onSelect, note.id]);

  useEffect(() => {
    if (isSelected) {
      ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isSelected]);

  return (
    <div
      ref={ref}
      className={`flex items-center gap-1.5 py-1 cursor-pointer rounded-md select-none ${
        isSelected
          ? "bg-bg-muted group-focus/notelist:ring-1 group-focus/notelist:ring-text-muted"
          : "hover:bg-bg-muted"
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px`, paddingRight: "8px" }}
      onClick={handleClick}
      role="button"
      tabIndex={-1}
    >
      {isPinned ? (
        <PinIcon className="w-3.5 h-3.5 stroke-[1.6] fill-current text-text-muted shrink-0" />
      ) : (
        <NoteIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
      )}
      <span className="text-sm text-text truncate">
        {cleanTitle(note.title)}
      </span>
    </div>
  );
});

interface FolderItemProps {
  folder: FolderNode;
  depth: number;
  collapsedFolders: Set<string>;
  onToggleCollapse: (path: string) => void;
  selectedNoteId: string | null;
  activeFolderPath: string | null;
  pinnedIds: Set<string>;
  onSelectNote: (id: string) => void;
  onSelectFolder: (path: string) => void;
  onCreateNoteHere: (path: string) => void;
  onNewSubfolder: (parentPath: string) => void;
  onRenameFolder: (path: string, currentName: string) => void;
  onDeleteFolder: (path: string) => void;
}

const FolderItemComponent = memo(function FolderItem({
  folder,
  depth,
  collapsedFolders,
  onToggleCollapse,
  selectedNoteId,
  activeFolderPath,
  pinnedIds,
  onSelectNote,
  onSelectFolder,
  onCreateNoteHere,
  onNewSubfolder,
  onRenameFolder,
  onDeleteFolder,
}: FolderItemProps) {
  const isCollapsed = collapsedFolders.has(folder.path);
  const noteCount = countNotesInFolder(folder);
  const isEmpty = noteCount === 0 && folder.children.length === 0;
  const isSelected = activeFolderPath === folder.path;

  const handleClick = useCallback(() => {
    onSelectFolder(folder.path);
    onToggleCollapse(folder.path);
  }, [onSelectFolder, onToggleCollapse, folder.path]);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div>
          <div
            className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer rounded-md select-none ${
              isSelected
                ? "bg-bg-muted"
                : "hover:bg-bg-muted"
            }`}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={handleClick}
            role="button"
            tabIndex={-1}
          >
            {isCollapsed ? (
              <ChevronRightIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
            ) : (
              <ChevronDownIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
            )}
            <FolderIcon className="w-4 h-4 text-text-muted shrink-0" />
            <span className="text-sm font-medium text-text truncate">
              {folder.name}
            </span>
            <span className="text-2xs text-text-muted ml-auto opacity-60 tabular-nums shrink-0">
              {noteCount > 0 ? noteCount : ""}
            </span>
          </div>

          {!isCollapsed && (
            <div>
              {folder.children.map((child) => (
                <FolderItemComponent
                  key={child.path}
                  folder={child}
                  depth={depth + 1}
                  collapsedFolders={collapsedFolders}
                  onToggleCollapse={onToggleCollapse}
                  selectedNoteId={selectedNoteId}
                  activeFolderPath={activeFolderPath}
                  pinnedIds={pinnedIds}
                  onSelectNote={onSelectNote}
                  onSelectFolder={onSelectFolder}
                  onCreateNoteHere={onCreateNoteHere}
                  onNewSubfolder={onNewSubfolder}
                  onRenameFolder={onRenameFolder}
                  onDeleteFolder={onDeleteFolder}
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
                />
              ))}
              {isEmpty && (
                <div
                  className="text-xs text-text-muted/50 py-1 select-none italic"
                  style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
                >
                  Empty
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
            New Note Here
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
            className={menuItemClass + " text-red-500 hover:text-red-500 focus:text-red-500"}
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
    activeFolderPath,
    setActiveFolderPath,
    createNoteInFolder,
    createFolder,
    deleteFolder,
    renameFolder,
  } = useNotes();

  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    loadCollapsedFolders
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [folderToRename, setFolderToRename] = useState<string | null>(null);
  const [renameDefaultValue, setRenameDefaultValue] = useState("");
  const [subfolderDialogOpen, setSubfolderDialogOpen] = useState(false);
  const [subfolderParent, setSubfolderParent] = useState("");
  const [knownFolders, setKnownFolders] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

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
    [notes, pinnedIds, knownFolders]
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
    []
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

  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      if (folderToRename) {
        await renameFolder(folderToRename, newName);
        setFolderToRename(null);
        setRenameDialogOpen(false);
      }
    },
    [folderToRename, renameFolder]
  );

  const handleSubfolderConfirm = useCallback(
    async (name: string) => {
      await createFolder(subfolderParent, name);
      setSubfolderDialogOpen(false);
    },
    [subfolderParent, createFolder]
  );

  // Listen for focus requests
  useEffect(() => {
    const handleFocus = () => containerRef.current?.focus();
    window.addEventListener("focus-note-list", handleFocus);
    return () => window.removeEventListener("focus-note-list", handleFocus);
  }, []);

  // Separate pinned and unpinned root notes
  const pinnedRootNotes = useMemo(
    () => tree.rootNotes.filter((n) => pinnedIds.has(n.id)),
    [tree.rootNotes, pinnedIds]
  );
  const unpinnedRootNotes = useMemo(
    () => tree.rootNotes.filter((n) => !pinnedIds.has(n.id)),
    [tree.rootNotes, pinnedIds]
  );

  return (
    <>
      <div
        ref={containerRef}
        tabIndex={0}
        data-note-list
        className="group/notelist flex flex-col gap-0.5 p-1.5 outline-none"
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
            activeFolderPath={activeFolderPath}
            pinnedIds={pinnedIds}
            onSelectNote={selectNote}
            onSelectFolder={setActiveFolderPath}
            onCreateNoteHere={createNoteInFolder}
            onNewSubfolder={handleNewSubfolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
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
          />
        ))}
      </div>

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
    </>
  );
}
