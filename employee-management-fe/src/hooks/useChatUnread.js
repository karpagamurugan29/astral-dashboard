import { useEffect, useState } from 'react'
import { subscribeUnread } from '../components/chat/chatApi'

// Unread chat messages (one shared poll for the header icon and the phone tab bar).
export const useChatUnread = () => {
    const [n, setN] = useState(0)
    useEffect(() => subscribeUnread(setN), [])
    return n
}
