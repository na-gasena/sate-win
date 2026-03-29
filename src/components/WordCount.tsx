interface WordCountProps {
  count: number;
}

export default function WordCount({ count }: WordCountProps) {
  return (
    <div className="word-count">
      {count}
    </div>
  );
}
