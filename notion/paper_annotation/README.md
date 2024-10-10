Read data from notion and use gemini-flash to annotate the papers.
Right now:
1. Data from one database are dulmped to a CSV
2. The data are read from ths CSV and row are sent to gemini flash to annotate the type of paper. 
The content is dumped to a second CSV
3. If the CSV is ok, it is mirrored on a second database on notion. ( still to be implemented.)