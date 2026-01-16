import { useChatStore } from "@/stores/chatStore";
import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

interface GlobalRulesDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export const GlobalRulesDialog = ({ isOpen, onClose }: GlobalRulesDialogProps) => {
    const canon = useChatStore(s => s.canon);
    const updateGlobalRules = useChatStore(s => s.updateGlobalRules);
    const [rules, setRules] = useState<string[]>([]);
    const [newRule, setNewRule] = useState("");

    useEffect(() => {
        if (isOpen) {
            setRules(canon?.globalRules || []);
        }
    }, [isOpen]); // Only reset when dialog opens

    const handleAdd = () => {
        if (!newRule.trim()) return;
        const nextRules = [...rules, newRule.trim()];
        setRules(nextRules);
        setNewRule("");
    };

    const handleDelete = (index: number) => {
        const nextRules = rules.filter((_, i) => i !== index);
        setRules(nextRules);
    };

    const handleSave = () => {
        updateGlobalRules(rules);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-zinc-900 border border-white/10 rounded-lg w-[500px] p-4 shadow-xl">
                <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                    <h2 className="text-sm font-bold text-amber-500 uppercase tracking-wider">
                        World Rules (Global Context)
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
                        <X size={16} />
                    </button>
                </div>

                <div className="space-y-4">
                    <p className="text-xs text-gray-400">
                        Define the fundamental laws of this world (e.g., &quot;Magic exists but is illegal&quot;, &quot;Technology is strictly medieval&quot;). These rules are injected into every prompt.
                    </p>

                    {/* List */}
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin">
                        {rules.length === 0 && (
                            <div className="text-xs text-gray-600 italic">No rules defined yet.</div>
                        )}
                        {rules.map((rule, i) => (
                            <div key={i} className="flex justify-between items-start bg-white/5 p-2 rounded text-sm text-gray-200 group">
                                <span>{rule}</span>
                                <button
                                    onClick={() => handleDelete(i)}
                                    className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Add Input */}
                    <div className="flex gap-2 pt-2 border-t border-white/5">
                        <input
                            type="text"
                            value={newRule}
                            onChange={(e) => setNewRule(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                            placeholder="Add a new rule..."
                            className="flex-1 bg-black/20 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                        />
                        <button
                            onClick={handleAdd}
                            disabled={!newRule.trim()}
                            className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-200 p-1.5 rounded disabled:opacity-50 transition-colors"
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5 rounded"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded font-medium"
                        >
                            Save Rules
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
