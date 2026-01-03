import { useChatStore } from '@/stores/chatStore';
import { clsx } from 'clsx';
import { Check, Edit2, Globe, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { CanonEntryDialog } from './CanonEntryDialog';
import { GlobalRulesDialog } from './GlobalRulesDialog';

export const CanonPanel = () => {
    const {
        canon,
        canonDrafts,
        runCuration,
        isCurating,
        approveCanonDraft,
        rejectCanonDraft,
        addCanonEntry,
        updateCanonEntry,
        deleteCanonEntry
    } = useChatStore();

    const [isEntryDialogOpen, setIsEntryDialogOpen] = useState(false);
    const [isRulesDialogOpen, setIsRulesDialogOpen] = useState(false);
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

    const handleAdd = () => {
        setEditingEntryId(null);
        setIsEntryDialogOpen(true);
    };

    const handleEdit = (entry: any) => {
        setEditingEntryId(entry.id);
        setIsEntryDialogOpen(true);
    };

    const handleDelete = (id: string) => {
        if (confirm('Are you sure you want to delete this entry?')) {
            deleteCanonEntry(id);
        }
    };

    const handleSaveEntry = (data: any) => {
        if (editingEntryId) {
            updateCanonEntry(editingEntryId, data);
        } else {
            addCanonEntry(data);
        }
    };

    const editingEntry = editingEntryId && canon?.entries ? canon.entries.find(e => e.id === editingEntryId) : undefined;

    return (
        <div className="flex flex-col h-full text-gray-200">
            {/* Header / Actions */}
            <div className="p-4 border-b border-white/5 space-y-3">
                <div className="flex justify-between items-center">
                    <p className="text-xs text-gray-400">
                        Managing {canon?.entries?.length || 0} entries
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsRulesDialogOpen(true)}
                            className="flex items-center gap-1 text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 px-2 py-1 rounded transition-colors border border-amber-500/10"
                            title="Edit Global Rules"
                        >
                            <Globe size={12} />
                            Rules
                        </button>
                        <button
                            onClick={handleAdd}
                            className="flex items-center gap-1 text-[10px] bg-white/5 hover:bg-white/10 text-zinc-300 px-2 py-1 rounded transition-colors border border-white/5"
                        >
                            <Plus size={12} />
                            Add Manual
                        </button>
                    </div>
                </div>

                <button
                    onClick={() => runCuration()}
                    disabled={isCurating}
                    className="w-full flex items-center justify-center gap-2 bg-linear-to-r from-amber-600/20 to-purple-600/20 hover:from-amber-600/30 hover:to-purple-600/30 border border-amber-500/20 text-amber-200 py-2 rounded-lg transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isCurating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {isCurating ? "Analyzing World..." : "Curate Canon"}
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin space-y-6">

                {/* Drafts Section */}
                {canonDrafts.length > 0 && (
                    <div className="space-y-3">
                        <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                            <Sparkles size={12} />
                            Proposed Updates ({canonDrafts.length})
                        </h3>
                        {canonDrafts.map((draft, i) => (
                            <div key={i} className="bg-amber-500/10 border border-amber-500/20 rounded-md p-3 animate-in fade-in slide-in-from-top-2">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex flex-col">
                                        <span className={clsx("text-[10px] font-bold px-1.5 py-0.5 rounded w-fit mb-1",
                                            draft.type === 'CREATE' ? "bg-green-500/20 text-green-300" : "bg-blue-500/20 text-blue-300"
                                        )}>
                                            {draft.type === 'CREATE' ? "NEW ENTRY" : "UPDATE"}
                                        </span>
                                        <span className="font-medium text-amber-100">{draft.entry.name}</span>
                                    </div>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => approveCanonDraft(i)}
                                            className="p-1 hover:bg-green-500/20 text-green-400 rounded transition-colors"
                                            title="Approve"
                                        >
                                            <Check size={16} />
                                        </button>
                                        <button
                                            onClick={() => rejectCanonDraft(i)}
                                            className="p-1 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                                            title="Reject"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>
                                <div className="text-xs text-gray-300 mb-2 italic">
                                    "{draft.reason}"
                                </div>
                                <div className="text-xs text-gray-400 bg-black/20 p-2 rounded">
                                    {draft.entry.description}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Existing Canon Section */}
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Encyclopedia ({canon?.entries?.length || 0})
                    </h3>

                    {(!canon?.entries || canon.entries.length === 0) ? (
                        <div className="text-gray-600 text-xs italic">No entries yet.</div>
                    ) : (
                        <div className="space-y-2">
                            {canon?.entries?.map((entry) => (
                                <div key={entry.id} className="group bg-white/5 border border-white/5 rounded-md p-3 hover:border-white/10 transition-colors">
                                    <div className="flex justify-between items-center mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-gray-200 text-sm">{entry.name}</span>
                                            <span className="text-[10px] text-gray-500 uppercase bg-white/5 px-1.5 py-0.5 rounded">
                                                {entry.category}
                                            </span>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEdit(entry)}
                                                className="text-gray-500 hover:text-amber-400 transition-colors p-1"
                                                title="Edit"
                                            >
                                                <Edit2 size={12} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(entry.id)}
                                                className="text-gray-500 hover:text-red-400 transition-colors p-1"
                                                title="Delete"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-400 line-clamp-3 white-space-pre-wrap">
                                        {entry.description}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <CanonEntryDialog
                isOpen={isEntryDialogOpen}
                onClose={() => setIsEntryDialogOpen(false)}
                onSave={handleSaveEntry}
                initialData={editingEntry}
                title={editingEntryId ? "Edit Entry" : "New Entry"}
            />

            <GlobalRulesDialog
                isOpen={isRulesDialogOpen}
                onClose={() => setIsRulesDialogOpen(false)}
            />
        </div>
    );
};
