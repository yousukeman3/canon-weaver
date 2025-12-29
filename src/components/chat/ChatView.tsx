import { Composer } from "./Composer";
import { MessageList } from "./MessageList";

export const ChatView = () => {
    return (
        <div className="flex flex-col h-full font-sans">
            {/* Scrollable Messages Area */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                <MessageList />
            </div>

            {/* Input Area (Fixed at bottom) */}
            <div className="shrink-0 w-full bg-linear-to-t from-black via-black/80 to-transparent pb-6 pt-10 px-4">
                <Composer />
            </div>
        </div>
    );
};
