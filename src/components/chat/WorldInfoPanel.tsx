import { DEFAULT_WORLD_STATE } from '@/lib/domain/schema';
import { ChatNode, ChatNodeId } from '@/lib/llm/chatTree';
import { useChatStore } from '@/stores/chatStore';
import { clsx, type ClassValue } from 'clsx';
import { Book, Brain, Lock, MapPin, Scroll, Tag, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const WorldInfoPanel = () => {
    const { tree, updatePlayerName, chronicle, wrapUpChapter } = useChatStore();
    const [activeTab, setActiveTab] = useState<'scene' | 'player' | 'entities' | 'quests' | 'lore' | 'chronicle'>('scene');
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState("");

    // Compute current state from head
    const currentState = useMemo(() => {
        if (!tree) return DEFAULT_WORLD_STATE;

        // Traverse back from head to find the latest state
        let pId: ChatNodeId | undefined = tree.headId;
        while (pId) {
            const node = tree.nodes[pId] as ChatNode;
            if (node.state) {
                return node.state;
            }
            pId = node.parentId;
        }
        return DEFAULT_WORLD_STATE;
    }, [tree]); // This might re-calc on every typing, optimizable via specific selectors but okay for now

    const handleSaveName = () => {
        if (editNameValue.trim()) {
            updatePlayerName(editNameValue.trim());
        }
        setIsEditingName(false);
    };

    return (
        <div className="flex flex-col h-full text-gray-200">
            {/* (Header removed - handled by RightSidebar container tabs) */}

            {/* Tabs */}
            <div className="flex border-b border-white/5 bg-black/10">
                <TabButton
                    active={activeTab === 'scene'}
                    onClick={() => setActiveTab('scene')}
                    icon={<MapPin size={14} />}
                    label="Scene"
                />
                <TabButton
                    active={activeTab === 'player'}
                    onClick={() => setActiveTab('player')}
                    icon={<Users size={14} />}
                    label="Player"
                />
                <TabButton
                    active={activeTab === 'entities'}
                    onClick={() => setActiveTab('entities')}
                    icon={<Users size={14} />}
                    label="Chars"
                />
                <TabButton
                    active={activeTab === 'quests'}
                    onClick={() => setActiveTab('quests')}
                    icon={<Scroll size={14} />}
                    label="Quests"
                />
                <TabButton
                    active={activeTab === 'lore'}
                    onClick={() => setActiveTab('lore')}
                    icon={<Brain size={14} />}
                    label="Lore"
                />
                <TabButton
                    active={activeTab === 'chronicle'}
                    onClick={() => setActiveTab('chronicle')}
                    icon={<Book size={14} />}
                    label="Chronicle"
                />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
                {activeTab === 'scene' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <Section title="Location">
                            <div className="bg-white/5 p-3 rounded-md border border-white/5">
                                <div className="text-lg font-serif text-purple-100">{currentState.scene.location.name}</div>
                                {currentState.scene.location.detail && (
                                    <div className="text-sm text-gray-400 mt-1">{currentState.scene.location.detail}</div>
                                )}
                            </div>
                        </Section>
                        <Section title="Environment">
                            <InfoRow label="Time" value={currentState.scene.time} />
                            <InfoRow label="Weather" value={currentState.scene.weather} />
                            <InfoRow label="Atmosphere" value={currentState.scene.atmosphere} />
                        </Section>
                    </div>
                )}

                {activeTab === 'player' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <Section title="Status">
                            <div className="bg-white/5 p-3 rounded-md border border-white/5 space-y-2">
                                <div className="flex justify-between items-center group">
                                    {isEditingName ? (
                                        <input
                                            type="text"
                                            value={editNameValue}
                                            onChange={(e) => setEditNameValue(e.target.value)}
                                            onBlur={handleSaveName}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                                            autoFocus
                                            className="bg-black/40 text-amber-100 border border-purple-500/50 rounded px-2 py-0.5 text-lg font-serif w-full focus:outline-none focus:border-purple-500"
                                        />
                                    ) : (
                                        <span
                                            className="text-lg font-serif text-amber-100 cursor-pointer hover:underline decoration-dashed underline-offset-4 decoration-white/20"
                                            onClick={() => {
                                                setEditNameValue(currentState.player.name);
                                                setIsEditingName(true);
                                            }}
                                            title="Click to rename"
                                        >
                                            {currentState.player.name}
                                        </span>
                                    )}
                                    <span className={clsx("text-xs px-2 py-0.5 rounded bg-black/40", statusColor(currentState.player.condition))}>
                                        {currentState.player.condition}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-400">
                                    <div><span className="text-gray-500">Loc:</span> {currentState.player.location.name}</div>
                                    {currentState.player.condition && <div><span className="text-gray-500">Condition:</span> {currentState.player.condition}</div>}
                                    {currentState.player.activity && <div><span className="text-gray-500">Activity:</span> {currentState.player.activity}</div>}
                                    {currentState.player.intent && <div><span className="text-gray-500">Intent:</span> {currentState.player.intent}</div>}
                                </div>
                            </div>

                            {currentState.player.attributes.length > 0 && (
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    {currentState.player.attributes.map((attr, j) => (
                                        <div key={j} className="flex justify-between bg-white/5 px-2 py-1.5 rounded border border-white/5 text-xs">
                                            <span className="text-gray-500">{attr.key}</span>
                                            <span className="text-gray-200">{String(attr.value)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Section>

                        <Section title="Inventory">
                            {currentState.player.inventory.length === 0 ? (
                                <div className="text-gray-600 italic text-xs">Empty</div>
                            ) : (
                                <ul className="space-y-1 text-xs list-disc list-inside text-gray-300">
                                    {currentState.player.inventory.map((item, i) => <li key={i}>{item}</li>)}
                                </ul>
                            )}
                        </Section>

                        <Section title="Capabilities">
                            {currentState.player.capabilities.length === 0 ? (
                                <div className="text-gray-600 italic text-xs">None</div>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
                                    {currentState.player.capabilities.map((cap, i) => (
                                        <span key={i} className="px-2 py-1 rounded-full bg-purple-500/10 text-purple-300 text-[10px] border border-purple-500/20">
                                            {cap}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </Section>
                    </div>
                )}

                {activeTab === 'entities' && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                        {currentState.entities.length === 0 ? (
                            <div className="text-gray-500 italic text-xs">No known entities yet.</div>
                        ) : (
                            currentState.entities.map((ent, i) => (
                                <div key={i} className="bg-white/5 rounded-md border border-white/5 overflow-hidden">
                                    <div className="px-3 py-2 bg-white/5 flex items-center justify-between">
                                        <span className="font-medium text-sm text-amber-100">{ent.name}</span>
                                        <div className="flex gap-2">
                                            {ent.relationToPlayer && (
                                                <span className={clsx("text-xs px-1.5 py-0.5 rounded bg-black/40 text-gray-300",
                                                    ent.relationToPlayer.toLowerCase().includes('hostile') ? 'text-red-300' :
                                                        ent.relationToPlayer.toLowerCase().includes('friend') ? 'text-green-300' : ''
                                                )}>
                                                    {ent.relationToPlayer}
                                                </span>
                                            )}
                                            <span className={clsx("text-xs px-1.5 py-0.5 rounded bg-black/40", statusColor(ent.condition))}>
                                                {ent.condition}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-3 text-xs space-y-2">
                                        {ent.activity && <div><span className="text-gray-500">Doing:</span> {ent.activity}</div>}
                                        {ent.intent && <div><span className="text-gray-500">Intent:</span> {ent.intent}</div>}
                                        {ent.location.name && <div><span className="text-gray-500">Loc:</span> {ent.location.name} {ent.location.detail}</div>}

                                        {ent.attributes.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-white/5 grid grid-cols-2 gap-1">
                                                {ent.attributes.map((attr, j) => (
                                                    <div key={j} className="flex justify-between bg-black/20 px-1.5 py-1 rounded">
                                                        <span className="text-gray-500">{attr.key}</span>
                                                        <span className="text-gray-300">{String(attr.value)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeTab === 'quests' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        {/* Quests */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase">Active Quests</h3>
                            {currentState.quests.length === 0 && <div className="text-gray-600 italic text-xs">None</div>}
                            {currentState.quests.map((q, i) => (
                                <div key={i} className="bg-white/5 rounded-md border border-white/5 p-3">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="font-medium text-sm text-blue-200">{q.label}</div>
                                        <QuestStatusBadge status={q.status} />
                                    </div>
                                    <div className="text-xs text-gray-400 mb-2">{q.description}</div>
                                    {q.steps.length > 0 && (
                                        <div className="space-y-1 pl-2 border-l-2 border-white/10">
                                            {q.steps.map((step, j) => (
                                                <div key={j} className="flex gap-2 text-xs">
                                                    <div className={step.completed ? "text-green-400" : "text-gray-600"}>
                                                        {step.completed ? "☑" : "☐"}
                                                    </div>
                                                    <div className={step.completed ? "text-gray-500 line-through" : "text-gray-300"}>
                                                        {step.description}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Threads */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase">Unresolved Threads</h3>
                            {currentState.threads.length === 0 && <div className="text-gray-600 italic text-xs">None</div>}
                            {currentState.threads.map((t, i) => (
                                <div key={i} className="flex gap-2 text-xs text-gray-300">
                                    <span className="text-purple-400">?</span>
                                    <span>{t.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'lore' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="space-y-2">
                            <h3 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Tag size={12} /> Facts</h3>
                            {currentState.facts.length === 0 && <div className="text-gray-600 italic text-xs">None</div>}
                            <ul className="space-y-1 text-xs list-disc list-inside text-gray-300">
                                {currentState.facts.map((f, i) => <li key={i}>{f}</li>)}
                            </ul>
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Brain size={12} /> Hypotheses</h3>
                            {currentState.hypotheses.length === 0 && <div className="text-gray-600 italic text-xs">None</div>}
                            <ul className="space-y-1 text-xs list-disc list-inside text-gray-400 marker:text-purple-500">
                                {currentState.hypotheses.map((h, i) => <li key={i}>{h}</li>)}
                            </ul>
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Lock size={12} /> Secrets</h3>
                            {currentState.secrets.length === 0 && <div className="text-gray-600 italic text-xs">None</div>}
                            <ul className="space-y-1 text-xs list-disc list-inside text-red-300/70 marker:text-red-500">
                                {currentState.secrets.map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                        </div>
                    </div>
                )}

                {activeTab === 'chronicle' && (
                    <div className="space-y-6 animate-in fade-in duration-300">

                        {/* Chapters Section */}
                        {chronicle?.chapters && chronicle.chapters.length > 0 && (
                            <div className="space-y-3">
                                <h3 className="text-xs font-bold text-amber-500 uppercase flex items-center gap-1">
                                    <Book size={12} /> Established History
                                </h3>
                                <div className="space-y-4 border-l border-amber-500/20 ml-2 pl-4">
                                    {chronicle.chapters.map((chapter, i) => (
                                        <div key={chapter.id || i} className="relative group">
                                            <div className="absolute -left-[21px] mt-1.5 h-2.5 w-2.5 rounded-sm bg-amber-500/50 border border-amber-900"></div>
                                            <div className="text-sm font-bold text-amber-100">{chapter.title}</div>
                                            <div className="text-xs text-gray-400 mt-1 leading-relaxed bg-black/20 p-2 rounded">
                                                {chapter.summary}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Events Section */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                                    <Scroll size={12} /> Recent Events
                                </h3>
                                {chronicle?.events && chronicle.events.length > 5 && (
                                    <button
                                        onClick={() => wrapUpChapter()}
                                        className="text-[10px] bg-white/5 hover:bg-white/10 text-gray-300 px-2 py-1 rounded transition-colors border border-white/5 flex items-center gap-1"
                                        title="Summarize events into a chapter"
                                    >
                                        <Book size={10} /> Wrap Up
                                    </button>
                                )}
                            </div>

                            {(!chronicle || !chronicle.events || chronicle.events.length === 0) && (
                                <div className="text-gray-600 italic text-xs text-center py-4">No new events recorded.</div>
                            )}

                            <div className="relative border-l border-gray-800 ml-2 space-y-6">
                                {chronicle?.events?.map((event, i) => (
                                    <div key={event.id || i} className="ml-4 relative group">
                                        <div className={cn(
                                            "absolute -left-[21px] mt-1.5 h-2.5 w-2.5 rounded-full border border-gray-900",
                                            event.type === 'SCENE_START' ? "bg-blue-500" :
                                                event.type === 'COMBAT_RESULT' ? "bg-red-500" :
                                                    event.type === 'MAJOR_DECISION' ? "bg-purple-500" :
                                                        "bg-gray-600"
                                        )}></div>
                                        <div className="text-[10px] text-gray-500 mb-0.5 font-mono">{event.timestamp}</div>
                                        <div className="text-sm font-medium text-gray-200">{event.summary}</div>
                                        <div className="text-[10px] text-gray-600 mt-1 uppercase tracking-wider">{event.type}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


const TabButton = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
    <button
        onClick={onClick}
        className={clsx(
            "flex-1 flex flex-col items-center justify-center py-2 text-[10px] uppercase font-bold tracking-wider transition-colors",
            active ? "text-purple-400 bg-white/5 border-b-2 border-purple-500" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
        )}
    >
        <span className="mb-0.5">{icon}</span>
        {label}
    </button>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-1.5">
        <h3 className="text-xs font-bold text-gray-500 uppercase">{title}</h3>
        {children}
    </div>
);

const InfoRow = ({ label, value }: { label: string; value?: string | number }) => {
    if (!value) return null;
    return (
        <div className="flex justify-between text-xs py-1 border-b border-dashed border-white/10 last:border-0">
            <span className="text-gray-500">{label}</span>
            <span className="text-gray-300">{value}</span>
        </div>
    );
};

const statusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'healthy' || s === 'active') return 'text-green-400';
    if (s.includes('injured') || s === 'dead') return 'text-red-400';
    if (s === 'hostile') return 'text-orange-400';
    return 'text-gray-300';
};

const QuestStatusBadge = ({ status }: { status: string }) => {
    let color = 'bg-gray-500/20 text-gray-400';
    if (status === 'ACTIVE') color = 'bg-blue-500/20 text-blue-400';
    if (status === 'COMPLETED') color = 'bg-green-500/20 text-green-400';
    if (status === 'FAILED') color = 'bg-red-500/20 text-red-400';

    return (
        <span className={clsx("text-[10px] font-bold px-1.5 py-0.5 rounded", color)}>
            {status}
        </span>
    );
};
