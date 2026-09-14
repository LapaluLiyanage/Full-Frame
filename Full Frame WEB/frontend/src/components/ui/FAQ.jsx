import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { gsap } from 'gsap';

const faqData = [
  {
    question: "Does this work on private albums?",
    answer: "Only albums your own account can already view — it doesn't bypass privacy settings."
  },
  {
    question: "Is it really free?",
    answer: "Yes, no premium tier, no ads, no hidden limits."
  },
  {
    question: "Will it break if Facebook changes their site?",
    answer: "Possibly — link to the GitHub repo/issues for bug reports."
  },
  {
    question: "Does it work on Edge?",
    answer: "Yes, Chrome & Edge 116+."
  },
  {
    question: "Can I download other people's photos?",
    answer: "Only what you can already see; reposting them elsewhere is a copyright/ToS question, not something this tool controls."
  }
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null);
  
  const toggleFAQ = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="faq-container">
      {faqData.map((item, index) => (
        <div key={index} className="faq-item">
          <button 
            className="faq-question"
            onClick={() => toggleFAQ(index)}
          >
            {item.question}
            <ChevronDown 
              style={{
                transform: openIndex === index ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s ease'
              }}
            />
          </button>
          <div className={`faq-answer ${openIndex === index ? 'open' : ''}`}>
            {item.answer}
          </div>
        </div>
      ))}
    </div>
  );
}
