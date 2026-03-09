'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export default function SearchReservations() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    function handleSearch(term: string) {
        // For MVP, simplistic reload with query param? 
        // Or just simple client side processing if we pass data?
        // Let's stick to the simplest: Form submission or just an input that reloads
        // Actually, let's just put this in the main page for now.
    }

    return (
        <div className="search-box" style={{ marginBottom: '1rem' }}>
            <input
                type="text"
                placeholder="名前で検索..."
                className="input"
                onChange={(e) => {
                    // TODO: Implement debounce search
                }}
            />
        </div>
    );
}
