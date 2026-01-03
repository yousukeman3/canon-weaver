import { WorldEntrySchema } from '@/lib/domain/schema';
import { Book, Save, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { z } from 'zod';

const EntrySchema = WorldEntrySchema.omit({ id: true });
type EntryData = z.infer<typeof EntrySchema>;

interface CanonEntryDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (entry: EntryData) => void;
    initialData?: Partial<EntryData>;
    title: string;
}

const CATEGORIES = ['CHARACTER', 'LOCATION', 'ITEM', 'LORE', 'RULE', 'FACTION'] as const;

export const CanonEntryDialog: React.FC<CanonEntryDialogProps> = ({
    isOpen,
    onClose,
    onSave,
    initialData,
    title
}) => {
    const [name, setName] = useState('');
    const [category, setCategory] = useState<typeof CATEGORIES[number]>('LORE');
    const [description, setDescription] = useState('');
    const [tags, setTags] = useState('');

    useEffect(() => {
        if (isOpen) {
            setName(initialData?.name || '');
            setCategory(initialData?.category || 'LORE');
            setDescription(initialData?.description || '');
            setTags(initialData?.tags?.join(', ') || '');
        }
    }, [isOpen, initialData]);

    const handleSave = () => {
        if (!name.trim()) return;

        const entry: EntryData = {
            name,
            category,
            description,
            tags: tags.split(',').map(t => t.trim()).filter(Boolean),
            aliases: [] // Basic implementation for now
        };

        onSave(entry);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="bg-white/5 px-4 py-3 flex justify-between items-center border-b border-white/5">
                    <div className="flex items-center gap-2 text-zinc-200 font-medium">
                        <Book size={18} className="text-amber-500" />
                        {title}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-zinc-500 hover:text-zinc-200 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 space-y-4 overflow-y-auto scrollbar-thin flex-1">
                    {/* Name */}
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1 uppercase tracking-vide">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. The Ancient Sword"
                            className="w-full bg-black/20 border border-white/10 rounded-md px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
                            autoFocus
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1 uppercase tracking-vide">Category</label>
                        <div className="grid grid-cols-2 gap-2">
                            {CATEGORIES.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setCategory(cat)}
                                    className={`text-xs px-2 py-1.5 rounded border transition-all ${category === cat
                                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
                                        : 'bg-white/5 border-transparent text-zinc-400 hover:bg-white/10'
                                        }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1 uppercase tracking-vide">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe the entry..."
                            rows={10}
                            className="w-full bg-black/20 border border-white/10 rounded-md px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-amber-500/50 transition-colors resize-y scrollbar-thin"
                        />
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1 uppercase tracking-vide">Tags (comma separated)</label>
                        <input
                            type="text"
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            placeholder="mystery, magic, history"
                            className="w-full bg-black/20 border border-white/10 rounded-md px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-white/5 px-4 py-3 flex justify-end gap-2 border-t border-white/5">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 rounded text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!name.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-900/20"
                    >
                        <Save size={14} />
                        Save Entry
                    </button>
                </div>
            </div>
        </div>
    );
};
